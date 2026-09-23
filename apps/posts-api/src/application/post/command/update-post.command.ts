import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import { AutoMap } from '@automapper/classes';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';

export namespace UpdatePostCommand {
  export class UpdatePost extends Command<void> {
    @AutoMap(() => PostId)
    readonly postId: PostId;
    @AutoMap(() => String)
    readonly title?: string | null;
    @AutoMap(() => String)
    readonly content?: string | null;

    constructor(
      postId: PostId,
      title?: string | null,
      content?: string | null,
    ) {
      super();
      this.postId = postId;
      this.title = title;
      this.content = content;
    }
  }

  @CommandHandler(UpdatePost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<UpdatePost> {
    constructor(
      private readonly posts: PostRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}
    async execute(command: UpdatePost): Promise<void> {
      const post = await this.posts.findById(command.postId);
      if (!post) {
        throw new PostNotFoundException(command.postId);
      }
      this.publisher
        .mergeObjectContext(post, this.request)
        .update({ title: command.title, content: command.content }, new Date());
      await this.posts.save(post);
      post.commit();
    }
  }
}
