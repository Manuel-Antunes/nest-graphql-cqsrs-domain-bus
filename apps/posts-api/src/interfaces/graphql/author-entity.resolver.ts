import type { Author } from '@nestposts/users/domain/user/author.entity';
import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Resolver, ResolveReference } from '@nestjs/graphql';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import type { EntityReference } from './entity-reference';
import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import { AuthorView } from '../../dto/graphql/user.view';

@AllowAnonymous()
@Resolver('Author')
export class AuthorEntityResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @UseInterceptors(MapInterceptor(User, AuthorView))
  resolveReference(reference: EntityReference): Promise<Author | null> {
    return this.queryBus.execute(
      new FindAuthorQuery.FindAuthor(UserId.parse(reference.id)),
    );
  }
}
