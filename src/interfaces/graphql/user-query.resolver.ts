import { UseInterceptors } from '@nestjs/common';
import { Query, ResolveField, Resolver } from '@nestjs/graphql';
import type { User } from '../../domain/user/user.entity';
import { AuthorView, type UserView } from '../../dto/graphql/user.view';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UserViewInterceptor } from '../interceptors/user-view.interceptor';

@Resolver('User')
export class UserQueryResolver {
  @Query('me')
  @UseInterceptors(UserViewInterceptor)
  me(@CurrentUser() user: User): User {
    return user;
  }

  @ResolveField()
  __resolveType(value: UserView): string {
    return value instanceof AuthorView ? 'Author' : 'Reader';
  }
}
