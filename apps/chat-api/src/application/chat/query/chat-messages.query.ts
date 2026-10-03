import type { BaseMessage } from '@langchain/core/messages';
import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Chat } from '@nestposts/chat/domain/chat/chat.entity';

import { AgentTranscripts } from '../../../infrastructure/transcripts/agent-transcripts';

export namespace ChatMessagesQuery {
  export class ChatMessages extends Query<BaseMessage[]> {
    constructor(
      readonly chat: Chat,
      readonly tenant: string,
    ) {
      super();
    }
  }

  @QueryHandler(ChatMessages)
  export class Handler implements IQueryHandler<ChatMessages> {
    constructor(private readonly transcripts: AgentTranscripts) {}

    execute({ chat, tenant }: ChatMessages): Promise<BaseMessage[]> {
      return this.transcripts.messagesOf(chat, tenant);
    }
  }
}
