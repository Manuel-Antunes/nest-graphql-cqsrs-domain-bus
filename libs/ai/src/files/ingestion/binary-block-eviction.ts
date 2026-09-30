import { createHash } from 'node:crypto';

export interface EvictableMessage {
  id?: string;
  content: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; name?: string; args?: unknown }>;
}

interface BinaryBlock {
  type: string;
  mimeType?: string;
  data?: unknown;
}

export class BinaryBlockEviction {
  static readonly MAX_INLINE_CHARS = 400_000;
  private static readonly BINARY_TYPES = new Set([
    'image',
    'audio',
    'video',
    'file',
  ]);

  static evict<T extends EvictableMessage>(
    messages: readonly T[],
    maxInlineChars = BinaryBlockEviction.MAX_INLINE_CHARS,
  ): readonly T[] {
    const paths = BinaryBlockEviction.readFilePaths(messages);
    const kept = new Set<string>();
    const rewritten = new Array<T>(messages.length);
    let budget = maxInlineChars;
    let evicted = 0;

    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      const blocks = message.content;
      if (
        !Array.isArray(blocks) ||
        !blocks.some(BinaryBlockEviction.isBinary)
      ) {
        rewritten[index] = message;
        continue;
      }

      let changed = false;
      const next = blocks.map((block) => {
        if (!BinaryBlockEviction.isBinary(block)) return block;
        const data = String(block.data ?? '');
        const digest = createHash('sha1').update(data).digest('hex');
        if (!kept.has(digest) && data.length <= budget) {
          kept.add(digest);
          budget -= data.length;
          return block;
        }
        changed = true;
        evicted += 1;
        return {
          type: 'text',
          text: BinaryBlockEviction.placeholderFor(
            block,
            paths.get(message.tool_call_id ?? '') ?? null,
            kept.has(digest),
          ),
        };
      });

      rewritten[index] = changed
        ? BinaryBlockEviction.withContent(message, next)
        : message;
    }

    return evicted === 0 ? messages : rewritten;
  }

  private static isBinary(block: unknown): block is BinaryBlock {
    return (
      typeof block === 'object' &&
      block !== null &&
      BinaryBlockEviction.BINARY_TYPES.has(
        (block as { type?: unknown }).type as string,
      ) &&
      typeof (block as { data?: unknown }).data === 'string'
    );
  }

  private static readFilePaths(
    messages: readonly EvictableMessage[],
  ): Map<string, string> {
    const paths = new Map<string, string>();
    for (const message of messages) {
      for (const call of message.tool_calls ?? []) {
        const path = (call.args as { file_path?: unknown } | undefined)
          ?.file_path;
        if (call.id && typeof path === 'string') paths.set(call.id, path);
      }
    }
    return paths;
  }

  private static placeholderFor(
    block: BinaryBlock,
    path: string | null,
    duplicate: boolean,
  ): string {
    const kind = block.mimeType ?? block.type;
    const where = path ? ` de ${path}` : '';
    const why = duplicate
      ? 'já está presente mais adiante nesta conversa'
      : 'foi retirado para não reenviar o arquivo inteiro a cada turno';
    const how = path
      ? ` Chame \`read_file("${path}")\` se precisar vê-lo de novo.`
      : '';
    return `[conteúdo ${kind}${where} ${why}.${how}]`;
  }

  private static withContent<T extends EvictableMessage>(
    message: T,
    content: unknown[],
  ): T {
    const clone = Object.create(
      Object.getPrototypeOf(message) as object,
    ) as Record<string, unknown>;
    Object.assign(clone, message);
    clone.content = content;
    const lcKwargs = (message as { lc_kwargs?: unknown }).lc_kwargs;
    if (lcKwargs && typeof lcKwargs === 'object') {
      clone.lc_kwargs = { ...lcKwargs, content };
    }
    return clone as T;
  }
}
