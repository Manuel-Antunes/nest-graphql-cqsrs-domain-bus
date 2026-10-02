import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import { ChatRepository } from '@nestposts/chat/domain/chat/chat.repository';
import { ChatNotFoundException } from '@nestposts/chat/domain/chat/exception/chat-not-found.exception';
import type { ChatId } from '@nestposts/chat/domain/chat/vo/chat-id';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { AgentTranscripts } from '../../../infrastructure/transcripts/agent-transcripts';

export namespace DeleteChatCommand {
  export class DeleteChat extends Command<void> {
    constructor(
      readonly chatId: ChatId,
      readonly owner: UserId,
      readonly tenant: string,
    ) {
      super();
    }
  }

  @CommandHandler(DeleteChat)
  export class Handler implements ICommandHandler<DeleteChat> {
    constructor(
      private readonly chats: ChatRepository,
      private readonly transcripts: AgentTranscripts,
    ) {}

    async execute({ chatId, owner, tenant }: DeleteChat): Promise<void> {
      const chat = await this.chats.findById(chatId);
      if (!chat?.isOwnedBy(owner)) throw new ChatNotFoundException(chatId);
      await this.transcripts.forget(chat, tenant);
      await this.chats.remove(chat);
    }
  }
}
