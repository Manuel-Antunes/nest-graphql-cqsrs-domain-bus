import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { Chat } from '@nestposts/chat/domain/chat/chat.entity';

export interface ChatView {
  readonly id: string;
  readonly agentId: string;
  readonly title: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly chat: Chat;
}

export interface ChatToolCallView {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export interface ChatMessageView {
  readonly id: string;
  readonly role: 'USER' | 'ASSISTANT' | 'TOOL';
  readonly content: string;
  readonly toolCalls: readonly ChatToolCallView[];
  readonly toolCallId: string | null;
}

export class ChatViews {
  static of(chat: Chat): ChatView {
    return {
      id: chat.id.value,
      agentId: chat.agentId.value,
      title: chat.title?.value ?? null,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      chat,
    };
  }

  static messagesOf(
    messages: readonly BaseMessage[],
    threadId: string,
  ): ChatMessageView[] {
    return messages.flatMap((message, index): ChatMessageView[] => {
      const id = message.id ?? `${threadId}:${index}`;
      if (HumanMessage.isInstance(message)) {
        return [ChatViews.message(id, 'USER', message.text)];
      }
      if (AIMessage.isInstance(message)) {
        return [
          {
            ...ChatViews.message(id, 'ASSISTANT', message.text),
            toolCalls: (message.tool_calls ?? []).map((call, position) => ({
              id: call.id ?? `${id}:${position}`,
              name: call.name,
              arguments: JSON.stringify(call.args ?? {}),
            })),
          },
        ];
      }
      if (ToolMessage.isInstance(message)) {
        return [
          {
            ...ChatViews.message(
              id,
              'TOOL',
              typeof message.content === 'string'
                ? message.content
                : message.text,
            ),
            toolCallId: message.tool_call_id,
          },
        ];
      }
      return [];
    });
  }

  private static message(
    id: string,
    role: ChatMessageView['role'],
    content: string,
  ): ChatMessageView {
    return { id, role, content, toolCalls: [], toolCallId: null };
  }
}
