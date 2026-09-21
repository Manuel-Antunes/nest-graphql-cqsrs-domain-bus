import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import type { Author } from '@nestposts/users/domain/user/author.entity';
import { AuthorRepository } from '@nestposts/users/domain/user/author.repository';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export namespace FindAuthorQuery {
  export class FindAuthor extends Query<Author | null> {
    constructor(readonly authorId: UserId) {
      super();
    }
  }

  @QueryHandler(FindAuthor)
  export class Handler implements IQueryHandler<FindAuthor> {
    constructor(private readonly authors: AuthorRepository) {}

    execute(query: FindAuthor): Promise<Author | null> {
      return this.authors.findById(query.authorId);
    }
  }
}
