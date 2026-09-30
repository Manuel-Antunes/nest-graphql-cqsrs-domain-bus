import { HumanMessage } from '@langchain/core/messages';

import type { ContentPart } from '../domain/file-content-part';
import type { MediaKind } from '../domain/media-kind';

export interface AttachmentBlock {
  path: string;
  fileName: string;
  kind: MediaKind;
  mimeType: string;
  url?: string;
  quoted?: boolean;
  marker?: string;
  caption?: string;
  text?: string;
}

type Kwargs = Record<string, unknown> | undefined;

export class AttachmentBlocks {
  static readonly KEY = 'attachments';

  static of(message: unknown): AttachmentBlock[] | undefined {
    const raw = (message as { additional_kwargs?: Kwargs })
      ?.additional_kwargs?.[AttachmentBlocks.KEY];
    if (!Array.isArray(raw) || raw.length === 0) return undefined;
    const blocks = raw.filter(
      (block): block is AttachmentBlock =>
        !!block &&
        typeof block === 'object' &&
        typeof (block as { path?: unknown }).path === 'string',
    );
    return blocks.length ? blocks : undefined;
  }

  static with(kwargs: Kwargs, blocks: AttachmentBlock[]): Kwargs {
    if (!blocks.length) return kwargs;
    return { ...(kwargs ?? {}), [AttachmentBlocks.KEY]: blocks };
  }

  static stored(block: AttachmentBlock): AttachmentBlock {
    return {
      path: block.path,
      fileName: block.fileName,
      kind: block.kind,
      mimeType: block.mimeType,
      ...(block.url ? { url: block.url } : {}),
      ...(block.quoted ? { quoted: true } : {}),
    };
  }

  static needsRehydration(block: AttachmentBlock): boolean {
    return !block.marker;
  }

  static strip(kwargs: Kwargs): Kwargs {
    const raw = kwargs?.[AttachmentBlocks.KEY];
    if (!Array.isArray(raw) || raw.length === 0) return kwargs;
    const blocks = raw as AttachmentBlock[];
    if (blocks.every(AttachmentBlocks.needsRehydration)) return kwargs;
    return {
      ...kwargs,
      [AttachmentBlocks.KEY]: blocks.map(AttachmentBlocks.stored),
    };
  }

  static render(block: AttachmentBlock): string {
    return [
      block.marker,
      block.caption ? `Legenda do usuário: ${block.caption}` : null,
      block.text || null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  static inflate<T>(message: T): T {
    const blocks = AttachmentBlocks.of(message);
    if (!blocks?.length) return message;

    const content = (message as { content?: unknown }).content;
    const parts: ContentPart[] = Array.isArray(content)
      ? [...(content as ContentPart[])]
      : typeof content === 'string' && content
        ? [{ type: 'text', text: content }]
        : [];

    const rendered = blocks
      .map(AttachmentBlocks.render)
      .filter((text) => text.length > 0);
    if (!rendered.length) return message;
    parts.push(...rendered.map((text) => ({ type: 'text' as const, text })));

    return new HumanMessage({
      id: (message as { id?: string }).id,
      content: parts as never,
      additional_kwargs: (message as { additional_kwargs?: Kwargs })
        .additional_kwargs,
    }) as T;
  }
}
