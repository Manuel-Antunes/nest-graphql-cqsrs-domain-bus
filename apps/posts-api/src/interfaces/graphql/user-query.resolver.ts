import { UseInterceptors } from '@nestjs/common';
import { Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '@nestposts/auth/decorators/current-user.decorator';
import type { User } from '@nestposts/users/domain/user/user.entity';

import type { IUserView } from '../../dto/graphql/user.view';
import { AuthorView } from '../../dto/graphql/user.view';
import { UserViewInterceptor } from '../interceptors/user-view.interceptor';

@Resolver('IUser')
export class UserQueryResolver {
  @Query('me')
  @UseInterceptors(UserViewInterceptor)
  me(@CurrentUser() user: User): User {
    return user;
  }

  @ResolveField()
  __resolveType(value: IUserView): string {
    return value instanceof AuthorView ? 'Author' : 'User';
  }
}
