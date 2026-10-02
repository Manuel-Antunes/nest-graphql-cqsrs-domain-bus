import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Chat } from '@nestposts/chat/domain/chat/chat.entity';
import { ChatRepository } from '@nestposts/chat/domain/chat/chat.repository';
import type { ChatId } from '@nestposts/chat/domain/chat/vo/chat-id';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export namespace FindChatQuery {
  export class FindChat extends Query<Chat | null> {
    constructor(
      readonly chatId: ChatId,
      readonly owner: UserId,
    ) {
      super();
    }
  }

  @QueryHandler(FindChat)
  export class Handler implements IQueryHandler<FindChat> {
    constructor(private readonly chats: ChatRepository) {}

    async execute({ chatId, owner }: FindChat): Promise<Chat | null> {
      const chat = await this.chats.findById(chatId);
      return chat?.isOwnedBy(owner) ? chat : null;
    }
  }
}
