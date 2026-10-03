import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { type AnyAgentMiddleware, createMiddleware } from 'langchain';

import { AgentRunContext } from '../agents/context/agent-run-context';
import type { ChatApi } from './chat-api';

export interface ChatRecordingOptions {
  readonly agentId: string;
  readonly chats: ChatApi;
}

export class ChatRecordingMiddleware {
  static create({ agentId, chats }: ChatRecordingOptions): AnyAgentMiddleware {
    return createMiddleware({
      name: 'ChatRecording',
      beforeAgent: async (state) => {
        const caller = AgentRunContext.current();
        const threadId = getConfig().configurable?.thread_id;
        if (!caller?.credential || typeof threadId !== 'string') {
          return undefined;
        }
        const title = (state.messages as BaseMessage[])
          .find((message) => HumanMessage.isInstance(message))
          ?.text.trim();
        await chats.record(
          { id: threadId, agentId, ...(title ? { title } : {}) },
          caller,
        );
        return undefined;
      },
    });
  }
}
