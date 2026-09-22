import type { QueryBus } from '@nestjs/cqrs';
import { FindUserQuery } from '../../application/user/query/find-user.query';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserEntityResolver } from './user-entity.resolver';

describe('UserEntityResolver', () => {
  const userId = UserId.parse('3a7b1c2d-4e5f-4a6b-8c9d-0e1f2a3b4c5d');
  const now = new Date('2026-09-08T12:00:00.000Z');

  const aUserWith = (roles: readonly string[]): User =>
    User.register(userId, { email: 'reader@example.com', name: 'reader' }, roles, now);

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new UserEntityResolver(bus), dispatched };
  };

  it('dispatches FindUser with the id the representation carries, as a value object', async () => {
    const { resolver, dispatched } = resolverOn(aUserWith([]));

    await resolver.resolveReference({ __typename: 'User', id: userId.value });

    expect(dispatched[0]).toBeInstanceOf(FindUserQuery.FindUser);
    expect((dispatched[0] as FindUserQuery.FindUser).userId.equals(userId)).toBe(true);
  });

  it('resolves the user who carries no capability', async () => {
    const reader = aUserWith([]);
    const { resolver } = resolverOn(reader);

    await expect(resolver.resolveReference({ __typename: 'User', id: userId.value })).resolves.toBe(reader);
  });

  it('an author asked for as a User is null, because that is what me answers too', async () => {
    const { resolver } = resolverOn(aUserWith([AUTHOR_ROLE]));

    await expect(
      resolver.resolveReference({ __typename: 'User', id: userId.value }),
    ).resolves.toBeNull();
  });

  it('a key that resolves to nothing is null', async () => {
    const { resolver } = resolverOn(null);

    await expect(
      resolver.resolveReference({ __typename: 'User', id: userId.value }),
    ).resolves.toBeNull();
  });
});
