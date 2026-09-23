import { Inject, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import type { Post } from '@nestposts/posts/domain/post/post.entity';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { EventSourcedRepository } from '@nestposts/transport-eventbus';

export namespace CompletePostWithDefaultTagCommand {
  export class CompletePostWithDefaultTag extends Command<void> {
    constructor(readonly postId: PostId) {
      super();
    }
  }

  @CommandHandler(CompletePostWithDefaultTag, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<CompletePostWithDefaultTag> {
    private readonly logger = new Logger('CompletePostWithDefaultTagCommand');

    constructor(
      private readonly posts: EventSourcedRepository<Post>,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}

    async execute(command: CompletePostWithDefaultTag): Promise<void> {
      const post = await this.posts.load(command.postId);
      if (!post) {
        throw new PostNotFoundException(command.postId);
      }
      if (post.isComplete()) {
        this.logger.log(
          `post ${command.postId.value} is already complete with ${post.tags
            .getIdentifiers()
            .map(String)
            .join(', ')} — duplicate delivery, dropped`,
        );
        return;
      }

      const defaultTag = Tag.default();
      this.logger.debug(
        `post ${command.postId.value} takes the default tag ${defaultTag.name.value}`,
      );

      this.publisher
        .mergeObjectContext(post, this.request)
        .complete([defaultTag], new Date());
      await this.posts.save(post);
      post.commit();
    }
  }
}
