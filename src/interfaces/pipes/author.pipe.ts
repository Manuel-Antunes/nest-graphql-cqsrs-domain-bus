import { Injectable, type PipeTransform } from '@nestjs/common';
import { NotAnAuthorException } from '../../domain/user/exception/not-an-author.exception';
import { type User } from '../../domain/user/user.entity';
import { type Author } from '../../domain/user/author.entity';
@Injectable()
export class AuthorPipe implements PipeTransform<User, Author> {
  transform(user: User): Author {
    const userId = user.id;
    if (!user.canWritePosts()) {
      throw new NotAnAuthorException(userId);
    }
    return user;
  }
}
