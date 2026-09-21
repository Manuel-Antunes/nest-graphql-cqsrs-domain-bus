import type { Mapper, ModelIdentifier } from '@automapper/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { AuthorView, UserView } from '../../dto/graphql/user.view';
import { UserViewInterceptor } from './user-view.interceptor';

describe('UserViewInterceptor', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  const mapperSpy = () => {
    const dispatched: Array<[ModelIdentifier, ModelIdentifier]> = [];
    const mapper = {
      mapAsync: (_source: unknown, from: ModelIdentifier, to: ModelIdentifier) => {
        dispatched.push([from, to]);
        return Promise.resolve({ to });
      },
    } as unknown as Mapper;
    return { mapper, dispatched };
  };

  const intercept = async (user: User) => {
    const { mapper, dispatched } = mapperSpy();
    const next: CallHandler<User> = { handle: () => of(user) };
    await lastValueFrom(
      new UserViewInterceptor(mapper).intercept({} as ExecutionContext, next as CallHandler),
    );
    return dispatched;
  };

  const aUser = (roles: readonly string[]): User =>
    User.register(UserId.generate(), { email: 'quem@example.com', name: 'quem' }, roles, now);

  it('a user carrying the author role is mapped as User → AuthorView', async () => {
    const dispatched = await intercept(aUser([AUTHOR_ROLE]));

    expect(dispatched).toEqual([[User, AuthorView]]);
  });

  it('a user without it is mapped as User → UserView', async () => {
    const dispatched = await intercept(aUser([]));

    expect(dispatched).toEqual([[User, UserView]]);
  });

  it('the triage is the role the aggregate carries, not one reimplemented here', async () => {
    const user = aUser([]);
    expect(await intercept(user)).toEqual([[User, UserView]]);

    user.grantRole(AUTHOR_ROLE, now);

    expect(await intercept(user)).toEqual([[User, AuthorView]]);
  });
});
