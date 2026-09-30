import type { Mapper } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { User } from '@nestposts/users/domain/user/user.entity';
import type { Observable } from 'rxjs';
import { concatMap } from 'rxjs';

import type { IUserView } from '../../dto/graphql/user.view';
import { UserProfile } from '../mapper/user.profile';

@Injectable()
export class UserViewInterceptor
  implements
    NestInterceptor<
      User | readonly User[] | null,
      IUserView | readonly IUserView[] | null
    >
{
  constructor(@InjectMapper() private readonly mapper: Mapper) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler<User | readonly User[] | null>,
  ): Observable<IUserView | readonly IUserView[] | null> {
    return next.handle().pipe(
      concatMap(
        async (users): Promise<IUserView | readonly IUserView[] | null> => {
          if (users === null) {
            return null;
          }
          return users instanceof User
            ? this.viewOf(users)
            : Promise.all(users.map((user) => this.viewOf(user)));
        },
      ),
    );
  }

  private viewOf(user: User): Promise<IUserView> {
    return this.mapper.mapAsync(user, User, UserProfile.viewTypeOf(user));
  }
}
