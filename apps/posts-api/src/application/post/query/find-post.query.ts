import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';

export namespace FindPostQuery {
  export class FindPost extends Query<Post | null> {
    constructor(readonly postId: PostId) {
      super();
    }
  }

  @QueryHandler(FindPost)
  export class Handler implements IQueryHandler<FindPost> {
    constructor(private readonly posts: PostRepository) {}
    async execute(query: FindPost): Promise<Post | null> {
      return this.posts.findById(query.postId);
    }
  }
}
