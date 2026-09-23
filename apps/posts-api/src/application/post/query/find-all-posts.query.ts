import type { IQueryHandler } from '@nestjs/cqrs';
import type { Post } from '@nestposts/posts/domain/post/post.entity';
import { type Cursor } from '@mikro-orm/core';
import { Query, QueryHandler } from '@nestjs/cqrs';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';

export namespace FindAllPostsQuery {
  export const DEFAULT_PAGE_SIZE = 20;
  export const MAX_PAGE_SIZE = 100;

  export class FindAllPosts extends Query<Cursor<Post>> {
    readonly first: number;

    constructor(
      first: number | null | undefined,
      readonly after?: string | null,
    ) {
      super();
      this.first = Math.min(
        Math.max(first ?? DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
      );
    }
  }

  @QueryHandler(FindAllPosts)
  export class Handler implements IQueryHandler<FindAllPosts> {
    constructor(private readonly posts: PostRepository) {}
    async execute(query: FindAllPosts): Promise<Cursor<Post>> {
      return this.posts.findAll({ first: query.first, after: query.after });
    }
  }
}
