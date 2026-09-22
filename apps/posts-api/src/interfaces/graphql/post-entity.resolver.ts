import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ResolveReference, Resolver } from '@nestjs/graphql';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostView } from '../../dto/graphql/post.view';
import type { EntityReference } from './entity-reference';

@AllowAnonymous()
@Resolver('Post')
export class PostEntityResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @UseInterceptors(MapInterceptor(Post, PostView))
  resolveReference(reference: EntityReference): Promise<Post | null> {
    return this.queryBus.execute(new FindPostQuery.FindPost(PostId.parse(reference.id)));
  }
}
