import { MapInterceptor } from '@automapper/nestjs';
import type { Cursor } from '@mikro-orm/core';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostView } from '../../dto/graphql/post.view';
import { ConnectionInterceptor } from '../interceptors/connection.interceptor';

@AllowAnonymous()
@Resolver('Post')
export class PostQueryResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query('post')
  @UseInterceptors(MapInterceptor(Post, PostView))
  async post(@Args('id') id: string): Promise<Post | null> {
    return this.queryBus.execute(new FindPostQuery.FindPost(PostId.parse(id)));
  }

  @Query('posts')
  @UseInterceptors(ConnectionInterceptor(Post, PostView))
  async posts(
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Promise<Cursor<Post>> {
    return this.queryBus.execute(
      new FindAllPostsQuery.FindAllPosts(first, after),
    );
  }
}
