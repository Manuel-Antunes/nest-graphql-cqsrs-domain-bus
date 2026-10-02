import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  RemoveMessage,
} from '@langchain/core/messages';
import { getConfig, REMOVE_ALL_MESSAGES } from '@langchain/langgraph';
import { type AnyAgentMiddleware, createMiddleware } from 'langchain';

import type {
  ConversationMemory,
  ConversationThread,
  ConversationTurn,
} from './conversation-memory';

export class ConversationMemoryMiddleware {
  constructor(private readonly memory: ConversationMemory) {}

  static create(memory: ConversationMemory): AnyAgentMiddleware {
    return new ConversationMemoryMiddleware(memory).build();
  }

  static threadOf(
    configurable: Record<string, unknown> | undefined,
  ): ConversationThread | undefined {
    const actorId = configurable?.user_id;
    const sessionId = configurable?.thread_id;
    return typeof actorId === 'string' &&
      actorId &&
      typeof sessionId === 'string' &&
      sessionId
      ? { actorId, sessionId }
      : undefined;
  }

  static lastTurnOf(messages: readonly BaseMessage[]): ConversationTurn[] {
    const answer = [...messages]
      .reverse()
      .find(
        (message) =>
          AIMessage.isInstance(message) && !message.tool_calls?.length,
      );
    const question = [...messages]
      .reverse()
      .find((message) => HumanMessage.isInstance(message));
    return [
      { role: 'user' as const, text: question?.text ?? '' },
      { role: 'assistant' as const, text: answer?.text ?? '' },
    ].filter((turn) => turn.text.trim().length > 0);
  }

  build(): AnyAgentMiddleware {
    return createMiddleware({
      name: 'ConversationMemory',
      beforeAgent: async (state) => {
        const thread = ConversationMemoryMiddleware.threadOf(
          getConfig().configurable,
        );
        const messages = state.messages as BaseMessage[];
        if (
          !thread ||
          messages.some((message) => AIMessage.isInstance(message))
        ) {
          return undefined;
        }
        const history = await this.memory.recall(thread);
        if (history.length === 0) return undefined;
        return {
          messages: [
            new RemoveMessage({ id: REMOVE_ALL_MESSAGES }),
            ...history.map(({ role, text }) =>
              role === 'user' ? new HumanMessage(text) : new AIMessage(text),
            ),
            ...messages,
          ],
        };
      },
      afterAgent: async (state) => {
        const thread = ConversationMemoryMiddleware.threadOf(
          getConfig().configurable,
        );
        if (!thread) return undefined;
        await this.memory.remember(
          thread,
          ConversationMemoryMiddleware.lastTurnOf(
            state.messages as BaseMessage[],
          ),
        );
        return undefined;
      },
    });
  }
}
