import type { StoredAttachment } from '@nestposts/asset/domain/asset/schemas/stored-asset.schema';

import type { MediaKind } from './media-kind';

export interface AttachmentSidecar {
  sourceId: string;
  kind: MediaKind;
  fileName?: string;
  mimeType: string;
  size: number;
  extname: string;
  caption?: string;
  createdAt: number;
  attachmentPath: string;
  asset: StoredAttachment;
  transcription?: string;
  analysis?: string;
}

export class SidecarKeys {
  static readonly SUFFIX = '.meta.json';

  static isSidecar(path: string): boolean {
    return path.endsWith(SidecarKeys.SUFFIX);
  }

  static of(root: string, sourceId: string): string {
    const prefix = SidecarKeys.trim(root);
    return prefix
      ? `${prefix}/${sourceId}${SidecarKeys.SUFFIX}`
      : `${sourceId}${SidecarKeys.SUFFIX}`;
  }

  static beside(key: string): string {
    const slash = key.lastIndexOf('/');
    const directory = slash >= 0 ? key.slice(0, slash + 1) : '';
    const file = slash >= 0 ? key.slice(slash + 1) : key;
    const dot = file.lastIndexOf('.');
    return `${directory}${dot > 0 ? file.slice(0, dot) : file}${SidecarKeys.SUFFIX}`;
  }

  static trim(path: string): string {
    return path.replace(/^\/+|\/+$/g, '');
  }
}
