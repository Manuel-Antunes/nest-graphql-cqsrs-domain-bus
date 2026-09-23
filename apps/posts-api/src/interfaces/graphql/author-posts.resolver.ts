import type { Cursor } from '@mikro-orm/core';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Post } from '@nestposts/posts/domain/post/post.entity';

import { FindPostsByAuthorQuery } from '../../application/post/query/find-posts-by-author.query';
import { PostView } from '../../dto/graphql/post.view';
import type { AuthorView } from '../../dto/graphql/user.view';
import { ConnectionInterceptor } from '../interceptors/connection.interceptor';

@Resolver('Author')
export class AuthorPostsResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveField('posts')
  @UseInterceptors(ConnectionInterceptor(Post, PostView))
  async posts(
    @Parent() author: AuthorView,
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Promise<Cursor<Post>> {
    return this.queryBus.execute(
      new FindPostsByAuthorQuery.FindPostsByAuthor(author.id, first, after),
    );
  }
}
