import type { Mapper } from '@automapper/core';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import type { Author } from '@nestposts/users/domain/user/author.entity';
import { InjectMapper, MapInterceptor, MapPipe } from '@automapper/nestjs';
import { UseFilters, UseInterceptors } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { Roles } from '@thallesp/nestjs-better-auth';

import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { CurrentTenant } from '../decorators/current-tenant.decorator';
import { CurrentAuthor } from '../decorators/current-user.decorator';
import { MikroOrmExceptionFilter } from '../filters/mikro-orm-exception.filter';

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
    @CurrentTenant() tenantId: string,
  ): Promise<Post> {
    const command = await this.mapper.mapAsync(
      input,
      CreatePostInput,
      CreatePostCommand.CreatePost,
      { extraArgs: () => ({ author }) },
    );
    const postId = await this.commandBus.execute(
      command,
      new PostRequest(command.postId, tenantId),
    );
    return this.savedPost(postId);
  }

  @Roles([AUTHOR_ROLE])
  @Mutation('updatePost')
  @UseInterceptors(MapInterceptor(Post, PostView))
  async updatePost(
    @Args('input', MapPipe(UpdatePostInput, UpdatePostCommand.UpdatePost))
    command: UpdatePostCommand.UpdatePost,
    @CurrentAuthor() _author: Author,
    @CurrentTenant() tenantId: string,
  ): Promise<Post> {
    await this.commandBus.execute(
      command,
      new PostRequest(command.postId, tenantId),
    );
    return this.savedPost(command.postId);
  }

  private async savedPost(postId: PostId): Promise<Post> {
    const post = await this.queryBus.execute(
      new FindPostQuery.FindPost(postId),
    );
    if (!post) {
      throw new PostNotFoundException(postId);
    }
    return post;
  }
}
