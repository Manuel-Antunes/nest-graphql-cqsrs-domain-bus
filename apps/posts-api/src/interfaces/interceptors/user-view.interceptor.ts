import type { Mapper } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { concatMap, type Observable } from 'rxjs';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { AuthorView, UserView, type IUserView } from '../../dto/graphql/user.view';

@Injectable()
export class UserViewInterceptor implements NestInterceptor<User, IUserView> {
  constructor(@InjectMapper() private readonly mapper: Mapper) {}

  intercept(_context: ExecutionContext, next: CallHandler<User>): Observable<IUserView> {
    return next.handle().pipe(
      concatMap((user) =>
        user.hasRole(AUTHOR_ROLE)
          ? this.mapper.mapAsync(user, User, AuthorView)
          : this.mapper.mapAsync(user, User, UserView),
      ),
    );
  }
}
