import { HumanMessage } from '@langchain/core/messages';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AnyAgentMiddleware, createMiddleware } from 'langchain';

import { SystemGuidance } from '../../middleware/system-guidance';
import { AttachmentReferences } from '../domain/attachment-references';
import type { AttachmentScopeConfig } from '../domain/attachment-scope';
import type { AttachmentSidecar } from '../domain/attachment-sidecar';
import type { ContentPart, FileContentPart } from '../domain/file-content-part';
import { type MediaKind, MediaKinds } from '../domain/media-kind';
import { RunScope } from '../drive/run-scope';
import { type AttachmentBlock, AttachmentBlocks } from './attachment-blocks';
import { AttachmentIngestionService } from './attachment-ingestion.service';
import { BinaryBlockEviction } from './binary-block-eviction';
import type { FileIngestionOptions } from './file-ingestion.options';
import { PrepareDocumentAssetTool } from './prepare-document-asset.tool';

interface AnyMessage {
  id?: string;
  content: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; name?: string; args?: unknown }>;
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
  _getType?: () => string;
}

interface Analysis {
  fileName: string;
  kind: MediaKind;
  text: string;
}

@Injectable()
export class FileIngestionMiddleware {
  private readonly logger = new Logger(FileIngestionMiddleware.name);

  constructor(
    @Inject(AttachmentIngestionService)
    private readonly ingestion: AttachmentIngestionService,
    @Inject(PrepareDocumentAssetTool)
    private readonly prepareDocumentAssetTool: PrepareDocumentAssetTool,
  ) {}

  create(options: FileIngestionOptions): AnyAgentMiddleware {
    return createMiddleware({
      name: 'FileIngestionMiddleware',
      tools: [this.prepareDocumentAssetTool],
      beforeModel: async (state, runtime) =>
        this.ingestPending(
          FileIngestionMiddleware.messagesOf(state),
          options,
          (runtime.configurable ?? undefined) as
            | AttachmentScopeConfig
            | undefined,
        ) as never,
      wrapModelCall: async (request, handler) => {
        const configurable = RunScope.configurable();
        let sidecars: AttachmentSidecar[] | null = null;
        const catalog = async () =>
          (sidecars ??= await this.ingestion.catalog(options, configurable));

        const rehydrated = await this.rehydrate(request.messages, catalog);
        const messages = rehydrated.map((message) =>
          AttachmentBlocks.inflate(message),
        );
        const inflated = messages.some(
          (message, index) => message !== request.messages[index],
        )
          ? { ...request, messages }
          : request;

        const instructions =
          typeof options.postAnalysisInstructions === 'function'
            ? await options.postAnalysisInstructions()
            : options.postAnalysisInstructions;
        if (!instructions || !(await catalog()).length)
          return handler(inflated);

        return handler({
          ...inflated,
          systemMessage: SystemGuidance.append(request, instructions),
        });
      },
      afterModel: async (state) =>
        this.prune(FileIngestionMiddleware.messagesOf(state)) as never,
      wrapToolCall: async (request, handler) => {
        const toolCall = request.toolCall;
        if (toolCall?.name !== AttachmentReferences.SUBAGENT_TOOL) {
          return handler(request);
        }
        const args = toolCall.args as Record<string, unknown> | undefined;
        const description = args?.description;
        if (
          typeof description !== 'string' ||
          !description ||
          description.includes(AttachmentReferences.RESOLVED_ASSETS_HEADER)
        ) {
          return handler(request);
        }

        const assets = await this.ingestion.resolveAssetsInText(
          description,
          options,
          RunScope.configurable(),
        );
        if (!assets.length) return handler(request);

        this.logger.log(
          `[wrapToolCall] injected ${assets.length} resolved asset(s) into ${AttachmentReferences.SUBAGENT_TOOL}: ${assets.map((asset) => asset.path).join(', ')}`,
        );
        return handler({
          ...request,
          toolCall: {
            ...toolCall,
            args: {
              ...args,
              description: `${description}\n\n${AttachmentReferences.render(assets)}`,
            },
          },
        });
      },
    });
  }

  private async ingestPending(
    messages: AnyMessage[],
    options: FileIngestionOptions,
    configurable: AttachmentScopeConfig | undefined,
  ): Promise<Record<string, unknown> | undefined> {
    const replacements: HumanMessage[] = [];
    const analyses: Analysis[] = [];
    let analysedIndex = -1;

    for (let index = 0; index < messages.length; index++) {
      const message = messages[index];
      if (message._getType?.() !== 'human' || !Array.isArray(message.content)) {
        continue;
      }
      const parts = message.content as ContentPart[];
      if (!parts.some((part) => part?.type === 'file')) continue;

      const content: ContentPart[] = [];
      const blocks: AttachmentBlock[] = [];
      for (const part of parts) {
        if (part?.type !== 'file') {
          content.push(part);
          continue;
        }
        const ingested = await this.ingestion.ingest(
          part as FileContentPart,
          options,
          configurable,
        );
        content.push(...ingested.parts);
        blocks.push({
          path: ingested.attachmentPath,
          fileName: ingested.fileName,
          kind: ingested.kind,
          mimeType: ingested.mimeType,
          marker: ingested.marker,
          ...(ingested.url ? { url: ingested.url } : {}),
          ...((part as FileContentPart).quoted ? { quoted: true } : {}),
          ...(ingested.caption ? { caption: ingested.caption } : {}),
          ...(ingested.analysisText ? { text: ingested.analysisText } : {}),
        });
        if (ingested.analysisText) {
          analyses.push({
            fileName: ingested.fileName,
            kind: ingested.kind,
            text: ingested.analysisText,
          });
          analysedIndex = index;
        }
      }

      replacements.push(
        FileIngestionMiddleware.rewrite(
          message,
          AttachmentBlocks.with(message.additional_kwargs, blocks),
          content,
        ),
      );
    }

    if (!replacements.length) return undefined;
    if (!analyses.length) return { messages: replacements };

    const lastToolData = analyses
      .map(
        (analysis) =>
          `Análise de ${analysis.fileName} (${MediaKinds.labelOf(analysis.kind)}):\n${analysis.text}`,
      )
      .join('\n\n---\n\n');
    this.logger.log(
      `[beforeModel] surfaced ${analyses.length} file analysis result(s) as lastToolData (${lastToolData.length} chars)`,
    );
    return {
      messages: replacements,
      lastToolData,
      lastToolDataMessageIndex: analysedIndex,
    };
  }

  private prune(
    messages: AnyMessage[],
  ): { messages: AnyMessage[] } | undefined {
    if (FileIngestionMiddleware.hasPendingToolCalls(messages.at(-1))) {
      return undefined;
    }

    const pruned = new Map<string, AnyMessage>();
    for (const message of messages) {
      if (message._getType?.() !== 'human' || !message.id) continue;
      const kwargs = message.additional_kwargs;
      const next = AttachmentBlocks.strip(kwargs);
      if (next === kwargs) continue;
      pruned.set(message.id, FileIngestionMiddleware.rewrite(message, next));
    }
    const enriched = pruned.size;

    const current = messages.map(
      (message) => (message.id && pruned.get(message.id)) || message,
    );
    const evicted = BinaryBlockEviction.evict(current, 0);
    let binaries = 0;
    evicted.forEach((message, index) => {
      if (message === current[index] || !message.id) return;
      pruned.set(message.id, message);
      binaries += 1;
    });

    if (!pruned.size) return undefined;
    this.logger.log(
      `[afterModel] pruned model-only enrichment from ${enriched} message(s) and inline binaries from ${binaries} before checkpoint`,
    );
    return { messages: [...pruned.values()] };
  }

  private async rehydrate<T extends AnyMessage>(
    messages: T[],
    catalog: () => Promise<AttachmentSidecar[]>,
  ): Promise<T[]> {
    const stale = messages.some((message) =>
      AttachmentBlocks.of(message)?.some(AttachmentBlocks.needsRehydration),
    );
    if (!stale) return messages;

    const byPath = new Map(
      (await catalog()).map((sidecar) => [sidecar.attachmentPath, sidecar]),
    );
    return messages.map((message) => {
      const blocks = AttachmentBlocks.of(message);
      if (!blocks?.some(AttachmentBlocks.needsRehydration)) return message;
      const restored = blocks.map((block) =>
        AttachmentBlocks.needsRehydration(block)
          ? this.ingestion.restore(block, byPath.get(block.path))
          : block,
      );
      return FileIngestionMiddleware.rewrite(
        message,
        AttachmentBlocks.with(message.additional_kwargs, restored),
      ) as unknown as T;
    });
  }

  private static rewrite(
    message: AnyMessage,
    additionalKwargs: Record<string, unknown> | undefined,
    content: unknown = message.content,
  ): HumanMessage {
    return new HumanMessage({
      id: message.id,
      content: content as never,
      ...(message.name ? { name: message.name } : {}),
      ...(message.response_metadata
        ? { response_metadata: message.response_metadata }
        : {}),
      additional_kwargs: additionalKwargs,
    });
  }

  private static hasPendingToolCalls(message: AnyMessage | undefined): boolean {
    if (message?._getType?.() !== 'ai') return false;
    return Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  }

  private static messagesOf(state: unknown): AnyMessage[] {
    return (state as { messages?: AnyMessage[] }).messages ?? [];
  }
}
