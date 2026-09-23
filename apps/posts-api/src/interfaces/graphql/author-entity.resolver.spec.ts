import type { QueryBus } from '@nestjs/cqrs';
import {
  AUTHOR_ROLE,
  Author,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import { AuthorEntityResolver } from './author-entity.resolver';

describe('AuthorEntityResolver', () => {
  const authorId = UserId.parse('3a7b1c2d-4e5f-4a6b-8c9d-0e1f2a3b4c5d');
  const now = new Date('2026-09-08T12:00:00.000Z');

  const anAuthor = (): Author => {
    const user = User.register(
      authorId,
      { email: 'manuel@example.com', name: 'manuel' },
      [AUTHOR_ROLE],
      now,
    );
    return Author.cast(user, Authorship.of(user));
  };

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new AuthorEntityResolver(bus), dispatched };
  };

  it('dispatches FindAuthor with the id the representation carries, as a value object', async () => {
    const { resolver, dispatched } = resolverOn(anAuthor());

    await resolver.resolveReference({
      __typename: 'Author',
      id: authorId.value,
    });

    expect(dispatched[0]).toBeInstanceOf(FindAuthorQuery.FindAuthor);
    expect(
      (dispatched[0] as FindAuthorQuery.FindAuthor).authorId.equals(authorId),
    ).toBe(true);
  });

  it('gives back the author the handler found, untouched', async () => {
    const author = anAuthor();
    const { resolver } = resolverOn(author);

    await expect(
      resolver.resolveReference({ __typename: 'Author', id: authorId.value }),
    ).resolves.toBe(author);
  });

  it('a user without the authorship delegate is null, and not an error', async () => {
    const { resolver } = resolverOn(null);

    await expect(
      resolver.resolveReference({ __typename: 'Author', id: authorId.value }),
    ).resolves.toBeNull();
  });
});
