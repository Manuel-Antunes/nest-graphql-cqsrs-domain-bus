import { AutoMap } from '@automapper/classes';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { InvalidPostException } from '@nestposts/posts/domain/post/exception/invalid-post.exception';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { AssetUpload } from '../../asset/upload-area';
import { UploadArea } from '../../asset/upload-area';

export namespace UpdatePostCommand {
  export class UpdatePost extends Command<void> {
    @AutoMap(() => PostId)
    readonly postId: PostId;
    @AutoMap(() => String)
    readonly title?: string | null;
    @AutoMap(() => String)
    readonly content?: string | null;
    readonly asset?: AssetUpload | null;
    @AutoMap(() => UserId)
    readonly editorId?: UserId;

    constructor(
      postId: PostId,
      title?: string | null,
      content?: string | null,
      asset?: AssetUpload | null,
      editorId?: UserId,
    ) {
      super();
      this.postId = postId;
      this.title = title;
      this.content = content;
      this.asset = asset;
      this.editorId = editorId;
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
      this.publisher.mergeObjectContext(post, this.request);
      const asset = this.stagedAsset(command);
      if (asset === null || command.title != null || command.content != null) {
        post.update(
          { title: command.title, content: command.content },
          new Date(),
        );
      }
      if (asset) {
        post.asset = asset;
      }
      await this.posts.save(post);
      post.commit();
    }

    private stagedAsset(command: UpdatePost) {
      if (!command.asset) {
        return null;
      }
      if (!command.editorId) {
        throw new InvalidPostException(
          'replacing an attachment needs to know who uploaded it',
        );
      }
      return UploadArea.stage(command.asset, command.editorId);
    }
  }
}
