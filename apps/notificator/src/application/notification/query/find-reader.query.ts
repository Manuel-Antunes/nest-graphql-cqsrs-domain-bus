import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import type { Email } from '@nestposts/users/domain/user/vo/email';

export namespace FindReaderQuery {
  export class FindReader extends Query<User | null> {
    constructor(readonly email: Email) {
      super();
    }
  }

  @QueryHandler(FindReader)
  export class Handler implements IQueryHandler<FindReader> {
    constructor(private readonly users: UserRepository) {}

    execute({ email }: FindReader): Promise<User | null> {
      return this.users.findByEmail(email);
    }
  }
}
