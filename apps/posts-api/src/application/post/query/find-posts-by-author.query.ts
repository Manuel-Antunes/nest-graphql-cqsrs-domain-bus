import { type Cursor } from '@mikro-orm/core';
import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { FindAllPostsQuery } from './find-all-posts.query';

export namespace FindPostsByAuthorQuery {
  export class FindPostsByAuthor extends Query<Cursor<Post>> {
    readonly first: number;

    constructor(
      readonly authorId: UserId,
      first: number | null | undefined,
      readonly after?: string | null,
    ) {
      super();
      this.first = Math.min(
        Math.max(first ?? FindAllPostsQuery.DEFAULT_PAGE_SIZE, 1),
        FindAllPostsQuery.MAX_PAGE_SIZE,
      );
    }
  }

  @QueryHandler(FindPostsByAuthor)
  export class Handler implements IQueryHandler<FindPostsByAuthor> {
    constructor(private readonly posts: PostRepository) {}

    async execute(query: FindPostsByAuthor): Promise<Cursor<Post>> {
      return this.posts.findByAuthor(query.authorId, {
        first: query.first,
        after: query.after,
      });
    }
  }
}
