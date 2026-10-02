import type { ContentPart, Message, ToolCall } from '@ag-ui/core';
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';

export interface LangChainTranscript {
  readonly messages: BaseMessage[];
  readonly instructions: string[];
}

type HumanBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'image'; data: string; mimeType: string };

export class AgUiMessages {
  static readonly MISSING_RESULT =
    'No result was recorded for this call: the conversation moved on before it answered.';

  static toLangChain(messages: readonly Message[]): LangChainTranscript {
    const instructions: string[] = [];
    const converted: BaseMessage[] = [];
    for (const message of messages) {
      if (message.subagentRunId !== undefined) continue;
      switch (message.role) {
        case 'user':
          converted.push(
            new HumanMessage({
              id: message.id,
              content: AgUiMessages.humanContentOf(message.content) as never,
            }),
          );
          break;
        case 'assistant':
          converted.push(
            new AIMessage({
              id: message.id,
              content: message.content ?? '',
              tool_calls: (message.toolCalls ?? []).map(AgUiMessages.callOf),
            }),
          );
          break;
        case 'tool':
          converted.push(
            new ToolMessage({
              id: message.id,
              tool_call_id: message.toolCallId,
              content:
                typeof message.content === 'string'
                  ? message.content
                  : AgUiMessages.textOf(message.content),
              status: message.error ? 'error' : 'success',
            }),
          );
          break;
        case 'system':
        case 'developer':
          if (message.content.trim()) instructions.push(message.content);
          break;
        default:
          break;
      }
    }
    return { messages: AgUiMessages.answered(converted), instructions };
  }

  private static answered(messages: readonly BaseMessage[]): BaseMessage[] {
    const result: BaseMessage[] = [];
    let pending = new Map<string, string>();
    const settle = () => {
      for (const [id, name] of pending) {
        result.push(
          new ToolMessage({
            tool_call_id: id,
            name,
            content: AgUiMessages.MISSING_RESULT,
            status: 'error',
          }),
        );
      }
      pending = new Map();
    };
    for (const message of messages) {
      if (ToolMessage.isInstance(message)) {
        if (!pending.has(message.tool_call_id)) continue;
        pending.delete(message.tool_call_id);
        result.push(message);
        continue;
      }
      settle();
      result.push(message);
      if (AIMessage.isInstance(message)) {
        for (const call of message.tool_calls ?? []) {
          if (call.id) pending.set(call.id, call.name);
        }
      }
    }
    settle();
    return result;
  }

  private static callOf(call: ToolCall) {
    return {
      id: call.id,
      name: call.function.name,
      args: AgUiMessages.argumentsOf(call.function.arguments),
      type: 'tool_call' as const,
    };
  }

  private static argumentsOf(serialized: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(serialized || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private static humanContentOf(
    content: string | ContentPart[],
  ): string | HumanBlock[] {
    if (typeof content === 'string') return content;
    return content.map((part): HumanBlock => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image' && part.source.type === 'url') {
        return { type: 'image', url: part.source.value };
      }
      if (part.type === 'image' && part.source.type === 'data') {
        return {
          type: 'image',
          data: part.source.value,
          mimeType: part.source.mimeType,
        };
      }
      return { type: 'text', text: `[${part.type} attachment]` };
    });
  }

  private static textOf(content: readonly ContentPart[]): string {
    return content
      .map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
      .join('\n');
  }
}
