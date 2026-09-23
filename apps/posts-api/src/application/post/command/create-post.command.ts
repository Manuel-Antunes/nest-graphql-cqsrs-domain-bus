import { AutoMap } from '@automapper/classes';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { delegateRef } from '@nestposts/platform/domain/shared/delegation/delegate';
import { PostAlreadyExistsException } from '@nestposts/posts/domain/post/exception/post-already-exists.exception';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { Author } from '@nestposts/users/domain/user/author.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

export namespace CreatePostCommand {
  export class CreatePost extends Command<PostId> {
    @AutoMap(() => PostId)
    readonly postId: PostId;
    @AutoMap()
    readonly title: string;
    @AutoMap()
    readonly content: string;
    @AutoMap(() => UserId)
    readonly authorId: UserId;
    @AutoMap(() => UserName)
    readonly authorName: UserName;

    constructor(
      postId: PostId,
      title: string,
      content: string,
      authorId: UserId,
      authorName: UserName,
    ) {
      super();
      this.postId = postId;
      this.title = title;
      this.content = content;
      this.authorId = authorId;
      this.authorName = authorName;
    }
  }

  @CommandHandler(CreatePost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<CreatePost> {
    constructor(
      private readonly posts: PostRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}
    async execute(command: CreatePost): Promise<PostId> {
      if (await this.posts.findById(command.postId)) {
        throw new PostAlreadyExistsException(command.postId);
      }
      const author = delegateRef(Author, command.authorId);
      const post = this.publisher.mergeObjectContext(
        Post.create(
          command.postId,
          { title: command.title, content: command.content },
          author,
          command.authorName,
          new Date(),
        ),
        this.request,
      );
      await this.posts.save(post);
      post.commit();
      return post.id;
    }
  }
}
