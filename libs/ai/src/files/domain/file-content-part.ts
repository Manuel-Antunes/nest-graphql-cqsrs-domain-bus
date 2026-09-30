import type { MediaKind } from './media-kind';

export interface FileContentPart {
  type: 'file';
  fileKind: MediaKind;
  mimeType: string;
  data?: string;
  uri?: string;
  fileName?: string;
  caption?: string;
  sourceId?: string;
  threadId?: string;
  quoted?: boolean;
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | FileContentPart
  | (Record<string, unknown> & { type: string });
