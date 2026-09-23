import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export namespace FindUserQuery {
  export class FindUser extends Query<User | null> {
    constructor(readonly userId: UserId) {
      super();
    }
  }

  @QueryHandler(FindUser)
  export class Handler implements IQueryHandler<FindUser> {
    constructor(private readonly users: UserRepository) {}

    execute(query: FindUser): Promise<User | null> {
      return this.users.findById(query.userId);
    }
  }
}
