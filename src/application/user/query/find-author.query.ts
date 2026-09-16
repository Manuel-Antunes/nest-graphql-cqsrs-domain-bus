import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import type { Author } from '../../../domain/user/author.entity';
import { UserRepository } from '../../../domain/user/user.repository';
import type { UserId } from '../../../domain/user/vo/user-id';

export namespace FindAuthorQuery {
  export class FindAuthor extends Query<Author | null> {
    constructor(readonly authorId: UserId) {
      super();
    }
  }

  @QueryHandler(FindAuthor)
  export class Handler implements IQueryHandler<FindAuthor> {
    constructor(private readonly users: UserRepository) {}

    async execute(query: FindAuthor): Promise<Author | null> {
      const user = await this.users.findById(query.authorId);
      return user?.canWritePosts() ? user : null;
    }
  }
}
