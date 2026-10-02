import type { Message } from '@ag-ui/client';

import type { TheoChatQuery } from '@/gql/graphql';

type ChatMessage = NonNullable<TheoChatQuery['chat']>['messages'][number];

export class TheoHistory {
  static messagesOf(messages: readonly ChatMessage[]): Message[] {
    return messages.map((message): Message => {
      switch (message.role) {
        case 'TOOL':
          return {
            id: message.id,
            role: 'tool',
            content: message.content,
            toolCallId: message.toolCallId ?? '',
          };
        case 'ASSISTANT':
          return {
            id: message.id,
            role: 'assistant',
            content: message.content,
            ...(message.toolCalls.length > 0
              ? {
                  toolCalls: message.toolCalls.map((call) => ({
                    id: call.id,
                    type: 'function' as const,
                    function: { name: call.name, arguments: call.arguments },
                  })),
                }
              : {}),
          };
        default:
          return { id: message.id, role: 'user', content: message.content };
      }
    });
  }
}
