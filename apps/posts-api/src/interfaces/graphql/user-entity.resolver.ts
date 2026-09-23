import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Resolver, ResolveReference } from '@nestjs/graphql';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import type { EntityReference } from './entity-reference';
import { FindUserQuery } from '../../application/user/query/find-user.query';
import { UserView } from '../../dto/graphql/user.view';

@AllowAnonymous()
@Resolver('User')
export class UserEntityResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @UseInterceptors(MapInterceptor(User, UserView))
  async resolveReference(reference: EntityReference): Promise<User | null> {
    const user = await this.queryBus.execute(
      new FindUserQuery.FindUser(UserId.parse(reference.id)),
    );
    return user && user.hasRole(AUTHOR_ROLE) ? null : user;
  }
}
