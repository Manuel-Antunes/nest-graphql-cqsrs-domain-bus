import { Injectable, type PipeTransform } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import { AUTHOR_ROLE, type Author } from '@nestposts/users/domain/user/author.entity';
import { NotAnAuthorException } from '@nestposts/users/domain/user/exception/not-an-author.exception';
import { type User } from '@nestposts/users/domain/user/user.entity';

@Injectable()
export class AuthorPipe implements PipeTransform<User | Promise<User>, Promise<Author>> {
  constructor(private readonly queryBus: QueryBus) {}

  async transform(maybeUser: User | Promise<User>): Promise<Author> {
    const user = await maybeUser;
    const author = user.hasRole(AUTHOR_ROLE)
      ? await this.queryBus.execute(new FindAuthorQuery.FindAuthor(user.id))
      : null;
    if (!author) {
      throw new NotAnAuthorException(user.id);
    }
    return author;
  }
}
