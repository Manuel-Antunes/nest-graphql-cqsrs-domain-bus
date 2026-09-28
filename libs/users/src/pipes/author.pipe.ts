import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import type { Author } from '../domain/user/author.entity';
import { AUTHOR_ROLE } from '../domain/user/author.entity';
import { AuthorRepository } from '../domain/user/author.repository';
import { NotAnAuthorException } from '../domain/user/exception/not-an-author.exception';
import type { User } from '../domain/user/user.entity';

@Injectable()
export class AuthorPipe
  implements PipeTransform<User | Promise<User>, Promise<Author>>
{
  constructor(private readonly authors: AuthorRepository) {}

  async transform(maybeUser: User | Promise<User>): Promise<Author> {
    const user = await maybeUser;
    const author = user.hasRole(AUTHOR_ROLE)
      ? await this.authors.findById(user.id)
      : null;
    if (!author) {
      throw new NotAnAuthorException(user.id);
    }
    return author;
  }
}
