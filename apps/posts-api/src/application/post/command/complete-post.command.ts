import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import type { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { Inject, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import { TagNotFoundException } from '@nestposts/posts/domain/tag/exception/tag-not-found.exception';
import { TagRepository } from '@nestposts/posts/domain/tag/tag.repository';

export namespace CompletePostCommand {
  export class CompletePost extends Command<void> {
    constructor(
      readonly postId: PostId,
      readonly tagId: TagId,
    ) {
      super();
    }
  }

  @CommandHandler(CompletePost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<CompletePost> {
    private readonly logger = new Logger('CompletePostCommand');

    constructor(
      private readonly posts: PostRepository,
      private readonly tags: TagRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}

    async execute(command: CompletePost): Promise<void> {
      const post = await this.posts.findById(command.postId);
      if (!post) {
        throw new PostNotFoundException(command.postId);
      }
      if (post.isComplete()) {
        this.logger.log(
          `post ${command.postId.value} was already complete — a repeated tagging decision, dropped`,
        );
        return;
      }
      const tag = await this.tags.findById(command.tagId);
      if (!tag) {
        throw new TagNotFoundException(command.tagId);
      }
      this.publisher
        .mergeObjectContext(post, this.request)
        .complete([tag], new Date());
      await this.posts.save(post);
      post.commit();
    }
  }
}
