import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { type AnyAgentMiddleware, createMiddleware } from 'langchain';

import type { AgentCallers } from '../agents/callers/agent-callers';
import { PlatformCaller } from '../agents/callers/platform-caller';
import type { ChatApi } from './chat-api';

export interface ChatRecordingOptions {
  readonly agentId: string;
  readonly chats: ChatApi;
  readonly callers: AgentCallers;
}

export class ChatRecordingMiddleware {
  static create({
    agentId,
    chats,
    callers,
  }: ChatRecordingOptions): AnyAgentMiddleware {
    return createMiddleware({
      name: 'ChatRecording',
      beforeAgent: async (state) => {
        const caller = callers.currentAs(PlatformCaller);
        const threadId = getConfig().configurable?.thread_id;
        if (!caller || typeof threadId !== 'string') return undefined;
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
