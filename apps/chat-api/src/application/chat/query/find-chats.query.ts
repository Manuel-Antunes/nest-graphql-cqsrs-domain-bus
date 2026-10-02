import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Chat } from '@nestposts/chat/domain/chat/chat.entity';
import type { ChatQuery } from '@nestposts/chat/domain/chat/chat.repository';
import { ChatRepository } from '@nestposts/chat/domain/chat/chat.repository';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export namespace FindChatsQuery {
  export class FindChats extends Query<Chat[]> {
    constructor(
      readonly owner: UserId,
      readonly query: ChatQuery,
    ) {
      super();
    }
  }

  @QueryHandler(FindChats)
  export class Handler implements IQueryHandler<FindChats> {
    constructor(private readonly chats: ChatRepository) {}

    execute({ owner, query }: FindChats): Promise<Chat[]> {
      return this.chats.findOwnedBy(owner, query);
    }
  }
}
