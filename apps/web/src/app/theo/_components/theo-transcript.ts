import type { Message } from '@ag-ui/client';

export const DELEGATION_TOOL = 'send_message_to_a2a_agent';

export type TranscriptEntry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'theo'; id: string; text: string }
  | {
      kind: 'delegation';
      id: string;
      agentName: string;
      task: string;
      said: string;
      result?: string;
    }
  | { kind: 'tool'; id: string; name: string; result?: string };

export class TheoTranscript {
  static of(messages: readonly Message[]): TranscriptEntry[] {
    const results = new Map<string, string>();
    const delegated = new Map<string, string>();
    for (const message of messages) {
      if (message.role === 'tool') {
        results.set(message.toolCallId, TheoTranscript.textOf(message.content));
      } else if (message.subagentRunId !== undefined) {
        delegated.set(
          message.subagentRunId,
          `${delegated.get(message.subagentRunId) ?? ''}${TheoTranscript.textOf(message.content)}`,
        );
      }
    }

    const entries: TranscriptEntry[] = [];
    for (const message of messages) {
      if (message.subagentRunId !== undefined) continue;
      if (message.role === 'user') {
        entries.push({
          kind: 'user',
          id: message.id,
          text: TheoTranscript.textOf(message.content),
        });
      }
      if (message.role !== 'assistant') continue;
      const text = TheoTranscript.textOf(message.content);
      if (text) entries.push({ kind: 'theo', id: message.id, text });
      for (const call of message.toolCalls ?? []) {
        if (call.function.name === DELEGATION_TOOL) {
          const args = TheoTranscript.argumentsOf(call.function.arguments);
          entries.push({
            kind: 'delegation',
            id: call.id,
            agentName: String(args.agentName ?? 'an agent'),
            task: String(args.task ?? ''),
            said: delegated.get(call.id) ?? '',
            result: results.get(call.id),
          });
        } else {
          entries.push({
            kind: 'tool',
            id: call.id,
            name: call.function.name,
            result: results.get(call.id),
          });
        }
      }
    }
    return entries;
  }

  private static textOf(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map((part) =>
        part && typeof part === 'object' && 'text' in part
          ? String((part as { text: unknown }).text)
          : '',
      )
      .join('');
  }

  private static argumentsOf(serialized: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(serialized || '{}');
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
