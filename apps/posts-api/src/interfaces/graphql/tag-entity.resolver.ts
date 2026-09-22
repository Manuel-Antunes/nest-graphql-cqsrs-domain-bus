import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ResolveReference, Resolver } from '@nestjs/graphql';
import { FindTagQuery } from '../../application/tag/query/find-tag.query';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { TagView } from '../../dto/graphql/tag.view';
import type { EntityReference } from './entity-reference';

@AllowAnonymous()
@Resolver('Tag')
export class TagEntityResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @UseInterceptors(MapInterceptor(Tag, TagView))
  resolveReference(reference: EntityReference): Promise<Tag | null> {
    return this.queryBus.execute(new FindTagQuery.FindTag(TagId.parse(reference.id)));
  }
}
