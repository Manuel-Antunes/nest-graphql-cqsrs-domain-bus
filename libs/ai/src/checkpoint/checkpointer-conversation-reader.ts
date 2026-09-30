import type { BaseMessage } from '@langchain/core/messages';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { Inject, Injectable } from '@nestjs/common';

import type { ConversationReader } from '../domain/messages/conversation-reader';
import { foldLangChainMessages } from './fold-langchain-messages';

/**
 * Reads a conversation out of the LangGraph checkpointer.
 *
 * The same read `LangChainTaskStore` performs for `GetTask`, and deliberately
 * the same fold — so "the message exists" means exactly "the message is one a
 * client would be shown", not "the id appears somewhere in graph state". A tool
 * result or a system prompt is in the thread and is not a message anyone can
 * give feedback on.
 */
@Injectable()
export class CheckpointerConversationReader implements ConversationReader {
  constructor(
    @Inject('CHAT_CHECKPOINTER')
    private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  async hasMessage(threadId: string, messageId: string): Promise<boolean> {
    const tuple = await this.checkpointer.getTuple({
      configurable: { thread_id: threadId },
    });
    const messages = tuple?.checkpoint?.channel_values?.messages;
    if (!Array.isArray(messages)) return false;

    return foldLangChainMessages(messages as BaseMessage[], threadId).some(
      (message) => message.id === messageId,
    );
  }
}
