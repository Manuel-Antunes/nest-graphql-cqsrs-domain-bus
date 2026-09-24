import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';

export namespace DeletePostCommand {
  export class DeletePost extends Command<void> {
    constructor(readonly postId: PostId) {
      super();
    }
  }

  @CommandHandler(DeletePost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<DeletePost> {
    constructor(
      private readonly posts: PostRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}

    async execute(command: DeletePost): Promise<void> {
      const post = await this.posts.findById(command.postId);
      if (!post) {
        throw new PostNotFoundException(command.postId);
      }
      this.publisher
        .mergeObjectContext(post, this.request)
        .softDelete(new Date());
      await this.posts.save(post);
      post.commit();
    }
  }
}
