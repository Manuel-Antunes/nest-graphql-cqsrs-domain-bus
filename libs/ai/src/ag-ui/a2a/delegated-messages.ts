import type { Message, ToolMessage } from '@ag-ui/core';

export class DelegatedMessages {
  static readonly UNANSWERED =
    'No result was recorded for this call: the conversation moved on before it answered.';

  private static readonly ORCHESTRATED: ReadonlySet<Message['role']> = new Set([
    'user',
    'assistant',
    'system',
    'developer',
    'tool',
    'reasoning',
  ]);

  static forOrchestrator(messages: readonly Message[]): Message[] {
    return DelegatedMessages.answered(
      messages.filter(
        (message) =>
          message.subagentRunId === undefined &&
          DelegatedMessages.ORCHESTRATED.has(message.role),
      ),
    );
  }

  static delegatedIn(messages: readonly Message[]): Message[] {
    return messages.filter((message) => message.subagentRunId !== undefined);
  }

  static withDelegated(
    snapshot: readonly Message[],
    delegated: readonly Message[],
  ): Message[] {
    const present = new Set(snapshot.map((message) => message.id));
    const pending = new Map<string, Message[]>();
    for (const message of delegated) {
      if (present.has(message.id) || message.subagentRunId === undefined) {
        continue;
      }
      pending.set(message.subagentRunId, [
        ...(pending.get(message.subagentRunId) ?? []),
        message,
      ]);
    }
    const merged: Message[] = [];
    for (const message of snapshot) {
      if (message.role === 'tool') {
        merged.push(...(pending.get(message.toolCallId) ?? []));
        pending.delete(message.toolCallId);
      }
      merged.push(message);
    }
    for (const rest of pending.values()) merged.push(...rest);
    return merged;
  }

  private static answered(messages: readonly Message[]): Message[] {
    const results = new Set(
      messages.flatMap((message) =>
        message.role === 'tool' ? [message.toolCallId] : [],
      ),
    );
    const result: Message[] = [];
    messages.forEach((message, index) => {
      result.push(message);
      const next = messages[index + 1];
      if (next?.role === 'tool') return;
      for (const closing of DelegatedMessages.closingFor(
        messages,
        index,
        results,
      )) {
        result.push(closing);
      }
    });
    return result;
  }

  private static closingFor(
    messages: readonly Message[],
    index: number,
    results: ReadonlySet<string>,
  ): ToolMessage[] {
    const caller = DelegatedMessages.callerAt(messages, index);
    if (!caller || caller.role !== 'assistant') return [];
    const movedOn = messages
      .slice(index + 1)
      .some((message) => message.role === 'user');
    if (!movedOn) return [];
    return (caller.toolCalls ?? [])
      .filter((call) => !results.has(call.id))
      .map((call) => ({
        id: `${call.id}:unanswered`,
        role: 'tool',
        toolCallId: call.id,
        content: DelegatedMessages.UNANSWERED,
      }));
  }

  private static callerAt(
    messages: readonly Message[],
    index: number,
  ): Message | undefined {
    for (let at = index; at >= 0; at--) {
      if (messages[at].role !== 'tool') return messages[at];
    }
    return undefined;
  }
}
