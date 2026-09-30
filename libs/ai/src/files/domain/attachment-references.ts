import type { StoredAttachment } from '@nestposts/asset/domain/asset/schemas/stored-asset.schema';

import type { AttachmentSidecar } from './attachment-sidecar';
import { SidecarKeys } from './attachment-sidecar';
import type { MediaKind } from './media-kind';

export interface ResolvedAttachmentAsset {
  path: string;
  fileName?: string;
  kind: MediaKind;
  asset: StoredAttachment;
}

export class AttachmentReferences {
  static readonly RESOLVED_ASSETS_HEADER =
    'ANEXOS RESOLVIDOS (asset canônico — use VERBATIM)';
  static readonly SUBAGENT_TOOL = 'task';

  static basenameOf(input: string): string {
    const file = input.split('/').filter(Boolean).pop() ?? '';
    if (!file) return '';
    if (SidecarKeys.isSidecar(file)) {
      return file.slice(0, -SidecarKeys.SUFFIX.length);
    }
    const dot = file.lastIndexOf('.');
    return dot > 0 ? file.slice(0, dot) : file;
  }

  static pathsIn(text: string, attachmentPathPrefix: string): string[] {
    const base = attachmentPathPrefix.replace(/\/+$/, '');
    if (!base) return [];
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(
      new RegExp(`${escaped}/[^\\s'"\`)\\]},;]+`, 'g'),
    );
    if (!matches) return [];
    const paths = new Set<string>();
    for (const raw of matches) {
      const path = raw.replace(/[.,;:!?]+$/, '');
      if (path.length > base.length + 1) paths.add(path);
    }
    return [...paths];
  }

  static matchCited(
    citedPath: string,
    sidecars: readonly AttachmentSidecar[],
  ): AttachmentSidecar | null {
    const citedFile = citedPath.split('/').filter(Boolean).pop() ?? '';
    const citedBase = AttachmentReferences.basenameOf(citedPath);
    if (!citedBase) return null;

    const same = (candidate: string | undefined, cited: string) =>
      !!candidate && candidate.toLowerCase() === cited.toLowerCase();

    const matches = sidecars.filter(
      (sidecar) =>
        same(sidecar.sourceId, citedBase) ||
        same(sidecar.fileName, citedFile) ||
        same(
          sidecar.fileName && AttachmentReferences.basenameOf(sidecar.fileName),
          citedBase,
        ) ||
        same(`${sidecar.kind}-${sidecar.sourceId}`, citedBase),
    );

    const sourceIds = [...new Set(matches.map((sidecar) => sidecar.sourceId))];
    return sourceIds.length === 1
      ? (matches.find((sidecar) => sidecar.sourceId === sourceIds[0]) ?? null)
      : null;
  }

  static render(assets: readonly ResolvedAttachmentAsset[]): string {
    const lines = [
      `## ${AttachmentReferences.RESOLVED_ASSETS_HEADER}`,
      'Os arquivos citados acima ja foram resolvidos pelo sistema. Para QUALQUER ferramenta que receba um `asset`, copie EXATAMENTE o objeto JSON abaixo. NAO monte o asset a mao, NAO edite nenhum campo e NAO passe o caminho do arquivo no lugar dele.',
      '',
    ];
    for (const entry of assets) {
      const label = entry.fileName ? ` (${entry.fileName})` : '';
      lines.push(`- ${entry.path}${label} — ${entry.kind}`);
      lines.push(`  asset: ${JSON.stringify(entry.asset)}`);
    }
    return lines.join('\n');
  }
}
