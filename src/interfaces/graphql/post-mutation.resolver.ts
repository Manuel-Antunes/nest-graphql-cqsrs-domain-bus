import type { Mapper } from '@automapper/core';
import { InjectMapper, MapInterceptor, MapPipe } from '@automapper/nestjs';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Roles } from '@thallesp/nestjs-better-auth';
import { UseFilters, UseInterceptors } from '@nestjs/common';
import { CurrentAuthor } from '../decorators/current-user.decorator';
import { MikroOrmExceptionFilter } from '../filters/mikro-orm-exception.filter';
import { AUTHOR_ROLE } from '../../domain/user/author.entity';
import { type Author } from '../../domain/user/author.entity';
import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import { Post } from '../../domain/post/post.entity';
import { PostNotFoundException } from '../../domain/post/exception/post-not-found.exception';
import type { PostId } from '../../domain/post/vo/post-id';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';

@Resolver('Post')
@UseFilters(MikroOrmExceptionFilter)
export class PostMutationResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @InjectMapper() private readonly mapper: Mapper,
  ) {}

  @Roles([AUTHOR_ROLE])
  @Mutation('createPost')
  @UseInterceptors(MapInterceptor(Post, PostView))
  async createPost(
    @Args('input') input: CreatePostInput,
    @CurrentAuthor() author: Author,
  ): Promise<Post> {
    const command = await this.mapper.mapAsync(
      input,
      CreatePostInput,
      CreatePostCommand.CreatePost,
      { extraArgs: () => ({ author }) },
    );
    const postId = await this.commandBus.execute(command, new PostRequest(command.postId));
    return this.savedPost(postId);
  }

  @Roles([AUTHOR_ROLE])
  @Mutation('updatePost')
  @UseInterceptors(MapInterceptor(Post, PostView))
  async updatePost(
    @Args('input', MapPipe(UpdatePostInput, UpdatePostCommand.UpdatePost))
    command: UpdatePostCommand.UpdatePost,
    @CurrentAuthor() _author: Author,
  ): Promise<Post> {
    await this.commandBus.execute(command, new PostRequest(command.postId));
    return this.savedPost(command.postId);
  }

  private async savedPost(postId: PostId): Promise<Post> {
    const post = await this.queryBus.execute(new FindPostQuery.FindPost(postId));
    if (!post) {
      throw new PostNotFoundException(postId);
    }
    return post;
  }
}
