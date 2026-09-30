import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Attachment } from '@nestposts/asset/domain/asset/attachment';

import { FileAnalysisService } from '../analysis/file-analysis.service';
import {
  AttachmentReferences,
  type ResolvedAttachmentAsset,
} from '../domain/attachment-references';
import {
  AttachmentScope,
  type AttachmentScopeConfig,
} from '../domain/attachment-scope';
import type { AttachmentSidecar } from '../domain/attachment-sidecar';
import type { ContentPart, FileContentPart } from '../domain/file-content-part';
import { type MediaKind, MediaKinds } from '../domain/media-kind';
import { AttachmentDrive } from '../drive/attachment-drive';
import type { AttachmentBlock } from './attachment-blocks';
import type { FileIngestionOptions } from './file-ingestion.options';

export interface IngestedFile {
  parts: ContentPart[];
  analysisText: string;
  fileName: string;
  kind: MediaKind;
  attachmentPath: string;
  marker: string;
  caption?: string;
  mimeType: string;
  url?: string;
}

interface IngestedRef {
  sourceId: string;
  kind: MediaKind;
  fileName?: string;
  caption?: string;
  mimeType: string;
  size: number;
  persisted: boolean;
  quoted?: boolean;
  url?: string;
  transcription?: string;
  analysis?: string;
}

@Injectable()
export class AttachmentIngestionService {
  private static readonly DOWNLOAD_TIMEOUT_MS = 30_000;
  private static readonly DOWNLOAD_MAX_BYTES = 50 * 1024 * 1024;
  private static readonly INLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

  private readonly logger = new Logger(AttachmentIngestionService.name);

  constructor(
    @Inject(AttachmentDrive) private readonly drive: AttachmentDrive,
    @Inject(FileAnalysisService) private readonly analysis: FileAnalysisService,
  ) {}

  rootOf(
    options: FileIngestionOptions,
    configurable?: AttachmentScopeConfig,
  ): string {
    return options.rootPrefix ?? AttachmentScope.rootOf(configurable);
  }

  catalog(
    options: FileIngestionOptions,
    configurable?: AttachmentScopeConfig,
  ): Promise<AttachmentSidecar[]> {
    return this.drive.catalog(
      this.rootOf(options, configurable),
      options.diskName,
    );
  }

  async resolveAssetsInText(
    text: string,
    options: FileIngestionOptions,
    configurable?: AttachmentScopeConfig,
  ): Promise<ResolvedAttachmentAsset[]> {
    const paths = AttachmentReferences.pathsIn(
      text,
      options.attachmentPathPrefix,
    );
    if (!paths.length) return [];

    const root = this.rootOf(options, configurable);
    let catalog: AttachmentSidecar[] | null = null;
    const resolved: ResolvedAttachmentAsset[] = [];

    for (const path of paths) {
      const basename = AttachmentReferences.basenameOf(path);
      if (!basename) continue;

      let sidecar = await this.drive.sidecar(root, basename, options.diskName);
      if (!sidecar) {
        catalog ??= await this.catalog(options, configurable);
        sidecar = AttachmentReferences.matchCited(path, catalog);
        if (sidecar) {
          this.logger.log(
            `[resolveAssetsInText] recovered cited "${path}" → "${sidecar.attachmentPath}"`,
          );
        }
      }

      if (!sidecar) {
        this.logger.warn(
          `[resolveAssetsInText] no sidecar for "${path}" (root="${root}")`,
        );
        continue;
      }

      if (!(await this.drive.holdsBytesOf(sidecar))) {
        this.logger.warn(
          `[resolveAssetsInText] orphan sidecar "${sidecar.attachmentPath}" — skipping`,
        );
        continue;
      }

      resolved.push({
        path: sidecar.attachmentPath,
        fileName: sidecar.fileName,
        kind: sidecar.kind,
        asset: sidecar.asset,
      });
    }
    return resolved;
  }

  async ingest(
    part: FileContentPart,
    options: FileIngestionOptions,
    configurable?: AttachmentScopeConfig,
  ): Promise<IngestedFile> {
    const sourceId = part.sourceId ?? `anon-${randomUUID()}`;
    const root = this.rootOf(options, configurable);

    const cached = await this.fromSidecar(sourceId, root, options, part);
    if (cached) return cached;

    const bytes = await this.bytesOf(part, sourceId);
    const attachment = bytes
      ? await Attachment.fromBuffer(
          bytes,
          part.fileName ??
            `${sourceId}.${AttachmentIngestionService.extensionOf(part)}`,
        )
      : undefined;
    const extname =
      attachment?.extname ?? AttachmentIngestionService.extensionOf(part);
    const attachmentPath = `${options.attachmentPathPrefix.replace(/\/+$/, '')}/${sourceId}.${extname}`;

    const persisted =
      !!attachment &&
      (await this.drive.store(attachment, {
        disk: this.drive.diskNameOf(options.diskName),
        path: root
          ? `${root}/${sourceId}.${extname}`
          : `${sourceId}.${extname}`,
      }));

    const ref: IngestedRef = {
      sourceId,
      kind: part.fileKind,
      fileName: part.fileName,
      caption: part.caption,
      mimeType: part.mimeType,
      size: bytes?.byteLength ?? 0,
      persisted,
      quoted: part.quoted,
      url:
        persisted && attachment
          ? this.drive.publicUrlOf(attachment)
          : undefined,
    };

    const analysisText =
      bytes && options.mode === 'eager'
        ? await this.analyze(part, bytes, ref)
        : '';

    if (persisted && attachment) {
      this.logger.log(
        `[ingest] persisted ${part.fileKind} sourceId="${sourceId}" → ${attachment.path} (${ref.size} bytes)`,
      );
      await this.drive.writeSidecar({
        sourceId,
        kind: part.fileKind,
        fileName: part.fileName,
        mimeType: part.mimeType,
        size: ref.size,
        extname,
        caption: part.caption,
        createdAt: Date.now(),
        attachmentPath,
        asset: attachment.toObject(),
        transcription: ref.transcription,
        analysis: ref.analysis,
      });
    }

    return this.resultOf(
      part,
      ref,
      attachmentPath,
      analysisText,
      options,
      part.data ?? bytes?.toString('base64'),
    );
  }

  restore(
    block: AttachmentBlock,
    sidecar: AttachmentSidecar | undefined,
  ): AttachmentBlock {
    if (!sidecar) return block;
    const text = sidecar.transcription ?? sidecar.analysis;
    return {
      ...block,
      fileName: block.fileName ?? sidecar.fileName ?? '',
      kind: block.kind ?? sidecar.kind,
      mimeType: block.mimeType ?? sidecar.mimeType,
      marker: this.markerOf(
        {
          sourceId: sidecar.sourceId,
          kind: sidecar.kind,
          fileName: sidecar.fileName,
          mimeType: sidecar.mimeType,
          size: sidecar.size,
          persisted: true,
          quoted: block.quoted,
        },
        sidecar.attachmentPath,
      ),
      ...(sidecar.caption ? { caption: sidecar.caption } : {}),
      ...(text ? { text } : {}),
    };
  }

  private async fromSidecar(
    sourceId: string,
    root: string,
    options: FileIngestionOptions,
    part: FileContentPart,
  ): Promise<IngestedFile | null> {
    const sidecar = await this.drive.sidecar(root, sourceId, options.diskName);
    if (!sidecar) return null;

    const analysisText = sidecar.transcription ?? sidecar.analysis ?? '';
    if (options.mode === 'eager' && !analysisText) return null;
    if (sidecar.kind === 'image' && options.inlineImageDataUri && !part.data) {
      return null;
    }
    if (!(await this.drive.holdsBytesOf(sidecar))) {
      this.logger.warn(
        `[ingest] sidecar hit for sourceId="${sourceId}" but its bytes are gone — re-ingesting`,
      );
      return null;
    }

    this.logger.log(
      `[ingest] sidecar hit for sourceId="${sourceId}" (${sidecar.kind}) — skipping store + analysis`,
    );
    return this.resultOf(
      part,
      {
        sourceId,
        kind: sidecar.kind,
        fileName: sidecar.fileName,
        caption: part.caption ?? sidecar.caption,
        mimeType: sidecar.mimeType,
        size: sidecar.size,
        persisted: true,
        quoted: part.quoted,
        url: this.drive.publicUrlOf(sidecar.asset),
      },
      sidecar.attachmentPath,
      analysisText,
      options,
      part.data,
    );
  }

  private resultOf(
    part: FileContentPart,
    ref: IngestedRef,
    attachmentPath: string,
    analysisText: string,
    options: FileIngestionOptions,
    inlineBase64: string | undefined,
  ): IngestedFile {
    return {
      parts: this.inlineImageOf(part, ref, options, inlineBase64),
      analysisText,
      fileName: ref.fileName ?? `${ref.kind}-${ref.sourceId}`,
      kind: ref.kind,
      attachmentPath,
      marker: this.markerOf(ref, attachmentPath),
      caption: ref.caption,
      mimeType: ref.mimeType,
      url: ref.url,
    };
  }

  private async analyze(
    part: FileContentPart,
    buffer: Buffer,
    ref: IngestedRef,
  ): Promise<string> {
    const input = {
      filename: part.fileName ?? `${part.fileKind}-${ref.sourceId}`,
      buffer,
      mimeType: part.mimeType,
      hint: part.caption,
    };
    try {
      const startedAt = Date.now();
      const text =
        part.fileKind === 'audio'
          ? await this.analysis.transcribeAudio(input)
          : part.fileKind === 'image'
            ? await this.analysis.analyzeImage(input)
            : await this.analysis.analyzeDocument(input);
      this.record(ref, part.fileKind, text);
      this.logger.log(
        `[ingest] ${part.fileKind} sourceId="${ref.sourceId}" analysed in ${Date.now() - startedAt}ms (${text.length} chars)`,
      );
      return text;
    } catch (error) {
      const message = AttachmentIngestionService.messageOf(error);
      this.logger.error(
        `[ingest] analysis failed for sourceId="${ref.sourceId}": ${message}`,
      );
      const text = `[Falha ao analisar ${part.fileKind}: ${message}]`;
      this.record(ref, part.fileKind, text);
      return text;
    }
  }

  private record(ref: IngestedRef, kind: MediaKind, text: string): void {
    if (kind === 'audio') ref.transcription = text;
    else ref.analysis = text;
  }

  private markerOf(ref: IngestedRef, attachmentPath: string): string {
    const label = MediaKinds.labelOf(ref.kind);
    const named = ref.fileName ? `${ref.fileName} — ` : '';
    const anexo = ref.quoted ? 'Anexo da mensagem citada' : 'Anexo';
    return ref.persisted
      ? `[${anexo}: ${named}${label} — path=${attachmentPath}]`
      : `[${anexo} NÃO salvo: ${named}${label} — falha ao gravar no armazenamento. NÃO é possível anexá-lo nem lê-lo; peça ao usuário para reenviar o arquivo.]`;
  }

  private inlineImageOf(
    part: FileContentPart,
    ref: IngestedRef,
    options: FileIngestionOptions,
    inlineBase64: string | undefined,
  ): ContentPart[] {
    if (ref.kind !== 'image' || !options.inlineImageDataUri || !inlineBase64) {
      return [];
    }
    if (ref.size > AttachmentIngestionService.INLINE_IMAGE_MAX_BYTES) {
      this.logger.warn(
        `[ingest] not inlining image sourceId="${ref.sourceId}" (${ref.size} bytes); the agent reads it with read_file`,
      );
      return [];
    }
    return [
      {
        type: 'image_url',
        image_url: { url: `data:${part.mimeType};base64,${inlineBase64}` },
      },
    ];
  }

  private async bytesOf(
    part: FileContentPart,
    sourceId: string,
  ): Promise<Buffer | undefined> {
    try {
      if (part.data) return Buffer.from(part.data, 'base64');
      if (!part.uri) return undefined;
      this.logger.log(
        `[ingest] downloading ${part.fileKind} sourceId="${sourceId}" from ${AttachmentIngestionService.redact(part.uri)}`,
      );
      return await AttachmentIngestionService.download(part.uri);
    } catch (error) {
      this.logger.error(
        `[ingest] could not read the bytes of sourceId="${sourceId}": ${AttachmentIngestionService.messageOf(error)}`,
      );
      return undefined;
    }
  }

  private static async download(uri: string): Promise<Buffer> {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      throw new Error(
        `invalid attachment uri "${AttachmentIngestionService.redact(uri)}"`,
      );
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`unsupported attachment uri scheme "${url.protocol}"`);
    }

    const limit = AttachmentIngestionService.DOWNLOAD_MAX_BYTES;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(
        AttachmentIngestionService.DOWNLOAD_TIMEOUT_MS,
      ),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const declared = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > limit) {
      throw new Error(`attachment too large (${declared} bytes > ${limit})`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > limit) {
      throw new Error(
        `attachment too large (${bytes.byteLength} bytes > ${limit})`,
      );
    }
    return bytes;
  }

  private static extensionOf(part: FileContentPart): string {
    const fromName = part.fileName?.split('.').pop()?.toLowerCase();
    if (fromName && fromName.length <= 5 && fromName !== part.fileName) {
      return fromName;
    }
    const subtype = part.mimeType.split('/')[1]?.split(';')[0]?.trim();
    if (subtype) return subtype === 'jpeg' ? 'jpg' : subtype;
    return part.fileKind === 'audio'
      ? 'ogg'
      : part.fileKind === 'image'
        ? 'jpg'
        : 'bin';
  }

  private static redact(uri: string): string {
    const query = uri.indexOf('?');
    return query >= 0 ? `${uri.slice(0, query)}?…` : uri;
  }

  private static messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
