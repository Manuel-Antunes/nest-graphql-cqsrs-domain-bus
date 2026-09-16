import type { Mapper } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { concatMap, type Observable } from 'rxjs';
import { type User } from '../../domain/user/user.entity';
import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { AuthorView, ReaderView, type UserView } from '../../dto/graphql/user.view';

@Injectable()
export class UserViewInterceptor implements NestInterceptor<User, UserView> {
  constructor(@InjectMapper() private readonly mapper: Mapper) {}

  intercept(_context: ExecutionContext, next: CallHandler<User>): Observable<UserView> {
    return next.handle().pipe(
      concatMap((user) =>
        user.canWritePosts()
          ? this.mapper.mapAsync(user, Author, AuthorView)
          : this.mapper.mapAsync(user as Reader, Reader, ReaderView),
      ),
    );
  }
}
