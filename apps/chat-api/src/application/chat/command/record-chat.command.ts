import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import { Chat } from '@nestposts/chat/domain/chat/chat.entity';
import { ChatRepository } from '@nestposts/chat/domain/chat/chat.repository';
import { ChatNotFoundException } from '@nestposts/chat/domain/chat/exception/chat-not-found.exception';
import type { AgentId } from '@nestposts/chat/domain/chat/vo/agent-id';
import type { ChatId } from '@nestposts/chat/domain/chat/vo/chat-id';
import type { ChatTitle } from '@nestposts/chat/domain/chat/vo/chat-title';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export namespace RecordChatCommand {
  export class RecordChat extends Command<Chat> {
    constructor(
      readonly chatId: ChatId,
      readonly owner: UserId,
      readonly agentId: AgentId,
      readonly title: ChatTitle | null,
    ) {
      super();
    }
  }

  @CommandHandler(RecordChat)
  export class Handler implements ICommandHandler<RecordChat> {
    constructor(private readonly chats: ChatRepository) {}

    async execute({
      chatId,
      owner,
      agentId,
      title,
    }: RecordChat): Promise<Chat> {
      const now = new Date();
      const known = await this.chats.findById(chatId);
      if (known && !known.isOwnedBy(owner)) {
        throw new ChatNotFoundException(chatId);
      }
      const chat = known
        ? known.continueWith(agentId, title, now)
        : Chat.start({ id: chatId, owner, agentId, title }, now);
      await this.chats.save(chat);
      return chat;
    }
  }
}
