import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import type { Chat } from '@nestposts/chat/domain/chat/chat.entity';
import { ChatRepository } from '@nestposts/chat/domain/chat/chat.repository';
import { ChatNotFoundException } from '@nestposts/chat/domain/chat/exception/chat-not-found.exception';
import type { ChatId } from '@nestposts/chat/domain/chat/vo/chat-id';
import type { ChatTitle } from '@nestposts/chat/domain/chat/vo/chat-title';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export namespace RenameChatCommand {
  export class RenameChat extends Command<Chat> {
    constructor(
      readonly chatId: ChatId,
      readonly owner: UserId,
      readonly title: ChatTitle,
    ) {
      super();
    }
  }

  @CommandHandler(RenameChat)
  export class Handler implements ICommandHandler<RenameChat> {
    constructor(private readonly chats: ChatRepository) {}

    async execute({ chatId, owner, title }: RenameChat): Promise<Chat> {
      const chat = await this.chats.findById(chatId);
      if (!chat?.isOwnedBy(owner)) throw new ChatNotFoundException(chatId);
      chat.retitle(title, new Date());
      await this.chats.save(chat);
      return chat;
    }
  }
}
