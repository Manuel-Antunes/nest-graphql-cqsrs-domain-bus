import { UseInterceptors } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { pageOf, type Page } from '../../dto/graphql/connection';
import { PostView } from '../../dto/graphql/post.view';
import { TagView } from '../../dto/graphql/tag.view';
import { ConnectionInterceptor } from '../interceptors/connection.interceptor';

@AllowAnonymous()
@Resolver('Post')
export class PostTagsResolver {
  @ResolveField('tags')
  @UseInterceptors(ConnectionInterceptor())
  tags(
    @Parent() post: PostView,
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Page<TagView> {
    const limit = Math.min(
      Math.max(first ?? FindAllPostsQuery.DEFAULT_PAGE_SIZE, 1),
      FindAllPostsQuery.MAX_PAGE_SIZE,
    );
    return pageOf(post.tags, limit, after);
  }
}
