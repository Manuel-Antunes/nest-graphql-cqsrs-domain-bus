import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import type { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import { TagNotFoundException } from '@nestposts/posts/domain/tag/exception/tag-not-found.exception';
import { TagRepository } from '@nestposts/posts/domain/tag/tag.repository';

export namespace AssignTagToPostCommand {
  export class AssignTagToPost extends Command<void> {
    constructor(
      readonly postId: PostId,
      readonly tagId: TagId,
    ) {
      super();
    }
  }

  @CommandHandler(AssignTagToPost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<AssignTagToPost> {
    constructor(
      private readonly posts: PostRepository,
      private readonly tags: TagRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}
    async execute(command: AssignTagToPost): Promise<void> {
      const tag = await this.tags.findById(command.tagId);
      if (!tag) {
        throw new TagNotFoundException(command.tagId);
      }
      const post = await this.posts.findById(command.postId);
      if (!post) {
        throw new PostNotFoundException(command.postId);
      }
      this.publisher
        .mergeObjectContext(post, this.request)
        .assignTag(tag, new Date());
      await this.posts.save(post);
      post.commit();
    }
  }
}
