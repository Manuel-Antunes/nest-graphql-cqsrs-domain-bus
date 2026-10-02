import { AIMessage } from '@langchain/core/messages';
import { type AnyAgentMiddleware, createMiddleware } from 'langchain';

interface InvalidCallLike {
  readonly type?: string;
  readonly id?: string;
  readonly name?: string;
  readonly args?: unknown;
}

export class EmptyToolInputMiddleware {
  static create(): AnyAgentMiddleware {
    return createMiddleware({
      name: 'EmptyToolInputMiddleware',
      wrapModelCall: async (request, handler) =>
        EmptyToolInputMiddleware.repair(await handler(request)),
    });
  }

  static repair<T>(response: T): T {
    if (!AIMessage.isInstance(response)) return response;
    const blocks = Array.isArray(response.content)
      ? (response.content as InvalidCallLike[])
      : [];
    const empty = new Map<string, string>();
    for (const call of [
      ...(response.invalid_tool_calls ?? []),
      ...blocks.filter(({ type }) => type === 'invalid_tool_call'),
    ]) {
      if (call.id && EmptyToolInputMiddleware.hasNoInput(call)) {
        empty.set(call.id, call.name ?? '');
      }
    }
    if (empty.size === 0) return response;
    const known = new Set((response.tool_calls ?? []).map(({ id }) => id));
    response.tool_calls = [
      ...(response.tool_calls ?? []),
      ...[...empty]
        .filter(([id]) => !known.has(id))
        .map(([id, name]) => ({
          id,
          name,
          args: {},
          type: 'tool_call' as const,
        })),
    ];
    response.invalid_tool_calls = (response.invalid_tool_calls ?? []).filter(
      ({ id }) => !id || !empty.has(id),
    );
    if (blocks.length > 0) {
      response.content = blocks.map((block) =>
        block.type === 'invalid_tool_call' && block.id && empty.has(block.id)
          ? { type: 'tool_call', id: block.id, name: block.name, args: {} }
          : block,
      ) as AIMessage['content'];
    }
    return response;
  }

  private static hasNoInput({ args }: InvalidCallLike): boolean {
    return typeof args !== 'string' || args.trim() === '';
  }
}
