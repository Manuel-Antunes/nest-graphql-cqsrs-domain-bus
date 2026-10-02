import type { ActivityMessage, Message } from '@ag-ui/client';

export const DELEGATION_TOOL = 'send_message_to_a2a_agent';

export const WEB_SEARCH_TOOL = 'search_the_web';

export const DRAWING_TOOLS: ReadonlySet<string> = new Set([
  'render_a2ui',
  'log_a2ui_event',
]);

export interface WebSource {
  title: string;
  url: string;
}

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
  | { kind: 'search'; id: string; query: string; sources?: WebSource[] }
  | { kind: 'tool'; id: string; name: string; result?: string }
  | { kind: 'activity'; id: string; message: ActivityMessage };

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
      if (message.role === 'activity') {
        entries.push({ kind: 'activity', id: message.id, message });
        continue;
      }
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
        if (DRAWING_TOOLS.has(call.function.name)) continue;
        if (call.function.name === DELEGATION_TOOL) {
          const args = TheoTranscript.argumentsOf(call.function.arguments);
          const result = results.get(call.id);
          entries.push({
            kind: 'delegation',
            id: call.id,
            agentName: String(args.agentName ?? 'an agent'),
            task: String(args.task ?? ''),
            said: delegated.get(call.id) ?? '',
            result:
              result === undefined
                ? undefined
                : TheoTranscript.answerOf(result),
          });
        } else if (call.function.name === WEB_SEARCH_TOOL) {
          const result = results.get(call.id);
          entries.push({
            kind: 'search',
            id: call.id,
            query: String(
              TheoTranscript.argumentsOf(call.function.arguments).query ?? '',
            ),
            sources:
              result === undefined
                ? undefined
                : TheoTranscript.sourcesOf(result),
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

  static answerOf(result: string): string {
    try {
      const parsed = JSON.parse(result) as {
        a2ui_operations?: unknown;
        answer?: unknown;
      } | null;
      return Array.isArray(parsed?.a2ui_operations) &&
        typeof parsed.answer === 'string'
        ? parsed.answer
        : result;
    } catch {
      return result;
    }
  }

  static sourcesOf(result: string): WebSource[] {
    return result.split(/\n{2,}/).flatMap((block) => {
      const [heading = '', url = ''] = block.split('\n');
      const title = heading.match(/^\[\d+\]\s+(.+)$/)?.[1];
      return title && /^https?:\/\//.test(url) ? [{ title, url }] : [];
    });
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
