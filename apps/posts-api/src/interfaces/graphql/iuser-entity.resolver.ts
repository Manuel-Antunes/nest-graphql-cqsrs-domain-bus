import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ResolveReference, Resolver } from '@nestjs/graphql';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { FindUserQuery } from '../../application/user/query/find-user.query';
import { UserViewInterceptor } from '../interceptors/user-view.interceptor';
import type { EntityReference } from './entity-reference';

@AllowAnonymous()
@Resolver('IUser')
export class IUserEntityResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @UseInterceptors(UserViewInterceptor)
  resolveReference(reference: EntityReference): Promise<User | null> {
    return this.queryBus.execute(
      new FindUserQuery.FindUser(UserId.parse(reference.id)),
    );
  }
}
