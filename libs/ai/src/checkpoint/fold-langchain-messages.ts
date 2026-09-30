import type { BaseMessage } from '@langchain/core/messages';

import type {
  LcMessageSource,
  LcToolCall,
} from '../domain/messages/langchain-message-parts';

/**
 * Fold a LangGraph `messages` channel into the per-message payload `toParts`
 * consumes.
 *
 * This is the TypeScript half of a fold that also exists in SQL, as
 * `chat_message_view`. Two implementations of one rule is a real cost and worth
 * naming: the view has to do it in SQL because `Chat.chatMessages` is a cursor
 * connection and a page boundary between a tool call and its result would render
 * a call that never came back; this has to do it in TypeScript because the A2A
 * task store is built on LangChain's `BaseStore` + `BaseCheckpointSaver`, which
 * are database-agnostic by design — the whole point being that swapping Postgres
 * for Redis is an injection, not a rewrite.
 *
 * They are kept honest by a parity test rather than by a shared implementation,
 * because there is no language both can share.
 *
 * ## The rules, which must match the view exactly
 *
 * - Only `HumanMessage` / `AIMessage` are user-visible. `SystemMessage` is the
 *   prompt, and `ToolMessage`s are consumed into the call they answer.
 * - A tool call carries its own result. `state` distinguishes the three outcomes
 *   a call actually has: it returned (`output-available`), it failed
 *   (`output-error`), or no `ToolMessage` exists at all (`input-available`) —
 *   the run died before the tool returned. Reading that last one as "still
 *   running" is what left failed imports spinning forever.
 * - Attachments are lifted out of `additional_kwargs`, where the file-ingestion
 *   middleware stashes one block per ingested file.
 * - A message with no text, no tool calls and no attachments is graph
 *   bookkeeping and is dropped.
 */

/** What a `ToolMessage` contributes to the call it answers. */
interface ToolOutput {
  content: unknown;
  status?: string;
}

/**
 * A message's LangChain class name.
 *
 * Read structurally rather than with `instanceof`: these come back from a
 * checkpointer, and whether they were revived as class instances depends on the
 * serializer. `_getType()` is the stable contract across both.
 */
function typeOf(message: BaseMessage): string {
  const withType = message as unknown as {
    _getType?: () => string;
    getType?: () => string;
  };
  return withType._getType?.() ?? withType.getType?.() ?? '';
}

/** The text of a message, flattening the `string | ContentBlock[]` union. */
function readContent(content: unknown): unknown {
  return content;
}

function additionalKwargs(message: BaseMessage): Record<string, unknown> {
  return (
    (message as unknown as { additional_kwargs?: Record<string, unknown> })
      .additional_kwargs ?? {}
  );
}

/** Whether the message carries anything a user should see. */
function isUserFacing(source: LcMessageSource): boolean {
  const hasToolCalls = (source.toolCalls?.length ?? 0) > 0;
  const hasAttachments = (source.attachments?.length ?? 0) > 0;

  const content = source.content;
  const hasContent =
    typeof content === 'string'
      ? content.length > 0
      : Array.isArray(content)
        ? content.length > 0
        : content != null;

  return hasToolCalls || hasAttachments || hasContent;
}

export interface FoldedMessage {
  /** The LangChain message id, or a positional fallback. */
  id: string;
  role: 'USER' | 'ASSISTANT';
  /** Position in the `messages` channel — the stable sort key. */
  seq: number;
  /** `response_metadata`, as the view exposes it. */
  metadata: unknown;
  /** The payload `toParts` shapes into `ChatMessagePart[]`. */
  source: LcMessageSource;
}

/**
 * Fold the channel.
 *
 * @param messages The `messages` channel of a checkpoint, in order.
 * @param threadId Used only for the synthetic id fallback, matching the view's
 *   `<threadId>:<seq>`.
 */
export function foldLangChainMessages(
  messages: readonly BaseMessage[],
  threadId: string,
): FoldedMessage[] {
  // tool_call_id -> that ToolMessage's content + status. Built first because a
  // call and its result are two messages and the result may come later.
  const outputs = new Map<string, ToolOutput>();
  for (const message of messages) {
    if (typeOf(message) !== 'tool') continue;
    const toolCallId = (message as unknown as { tool_call_id?: string })
      .tool_call_id;
    if (!toolCallId) continue;
    outputs.set(toolCallId, {
      content: message.content,
      status: (message as unknown as { status?: string }).status,
    });
  }

  const folded: FoldedMessage[] = [];

  messages.forEach((message, index) => {
    const type = typeOf(message);
    if (type !== 'human' && type !== 'ai') return;

    const rawToolCalls =
      (
        message as unknown as {
          tool_calls?: { id?: string; name?: string; args?: unknown }[];
        }
      ).tool_calls ?? [];

    const toolCalls: LcToolCall[] = rawToolCalls.map((call) => {
      const output = call.id ? outputs.get(call.id) : undefined;
      return {
        id: call.id,
        name: call.name,
        args: call.args,
        output: output?.content,
        // No ToolMessage at all means the run died before the tool returned —
        // NOT that it is still running.
        state: !output
          ? 'input-available'
          : output.status === 'error'
            ? 'output-error'
            : 'output-available',
      };
    });

    const kwargs = additionalKwargs(message);
    const attachments = Array.isArray(kwargs.attachments)
      ? (kwargs.attachments as LcMessageSource['attachments'])
      : [];

    const source: LcMessageSource = {
      content: readContent(message.content),
      attachments,
      toolCalls,
    };

    if (!isUserFacing(source)) return;

    folded.push({
      id:
        (message as unknown as { id?: string }).id ??
        `${threadId}:${index + 1}`,
      role: type === 'human' ? 'USER' : 'ASSISTANT',
      seq: index + 1,
      metadata:
        (message as unknown as { response_metadata?: unknown })
          .response_metadata ?? null,
      source,
    });
  });

  return folded;
}
