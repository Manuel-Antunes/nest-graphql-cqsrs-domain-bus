import { Inject, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { PostCreatedNotification } from '@nestposts/posts/domain/post/notification/post-created.notification';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import type { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { WebLinks } from '../../shared/web-links';

export namespace NotifyPostCreatedCommand {
  export class NotifyPostCreated extends Command<void> {
    constructor(
      readonly postId: PostId,
      readonly title: PostTitle,
      readonly authorId: UserId,
    ) {
      super();
    }
  }

  @CommandHandler(NotifyPostCreated, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<NotifyPostCreated> {
    private readonly logger = new Logger(NotifyPostCreated.name);

    constructor(
      private readonly users: UserRepository,
      private readonly links: WebLinks,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}

    async execute({
      postId,
      title,
      authorId,
    }: NotifyPostCreated): Promise<void> {
      const author = await this.users.findById(authorId);
      if (!author) {
        this.logger.warn(
          `the author ${authorId} of post ${postId} is gone — nobody to tell it was created`,
        );
        return;
      }
      this.publisher
        .mergeObjectContext(author, this.request)
        .notify(
          new PostCreatedNotification(
            { id: postId, title },
            { url: this.links.post(postId) },
          ),
          new Date(),
        );
      author.commit();
    }
  }
}
