import { MikroORM } from '@mikro-orm/core';
import type { QueryBus } from '@nestjs/cqrs';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import {
  AUTHOR_ROLE,
  Author,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { NotAnAuthorException } from '@nestposts/users/domain/user/exception/not-an-author.exception';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import { AuthorPipe } from './author.pipe';

describe('AuthorPipe', () => {
  let orm: MikroORM;
  const now = new Date('2026-09-08T12:00:00.000Z');

  beforeAll(async () => {
    orm = await testDatabase({
      entities: [
        PostEntitySchema,
        TagSchema,
        UserEntitySchema,
        AuthorshipEntitySchema,
      ],
    });
  });

  afterAll(() => closeTestDatabase(orm));

  const pipeFinding = (author: Author | null) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(author);
      },
    } as unknown as QueryBus;
    return { pipe: new AuthorPipe(bus), dispatched };
  };

  const aUser = (roles: readonly string[]): User =>
    User.register(
      UserId.generate(),
      { email: `x+${UserId.generate()}@example.com`, name: 'manuel' },
      roles,
      now,
    );

  const anAuthor = (user: User): Author =>
    Author.cast(user, Authorship.of(user));

  it('asks for the author by the id of the session user, as a value object', async () => {
    const user = aUser([AUTHOR_ROLE]);
    const { pipe, dispatched } = pipeFinding(anAuthor(user));

    await pipe.transform(user);

    expect(dispatched[0]).toBeInstanceOf(FindAuthorQuery.FindAuthor);
    expect(
      (dispatched[0] as FindAuthorQuery.FindAuthor).authorId.equals(user.id),
    ).toBe(true);
  });

  it('hands back what came out of the query, already an Author', async () => {
    const user = aUser([AUTHOR_ROLE]);
    const author = anAuthor(user);

    expect(await pipeFinding(author).pipe.transform(user)).toBe(author);
  });

  it('refuses a user without the author role, and does not even ask', async () => {
    const user = aUser([]);
    const { pipe, dispatched } = pipeFinding(null);

    await expect(pipe.transform(user)).rejects.toThrow(NotAnAuthorException);
    expect(dispatched).toEqual([]);
  });

  it('the role alone is not enough: without the delegate row there is nothing to cast over', async () => {
    const user = aUser([AUTHOR_ROLE]);
    const { pipe, dispatched } = pipeFinding(null);

    await expect(pipe.transform(user)).rejects.toThrow(NotAnAuthorException);
    expect(dispatched).toHaveLength(1);
  });

  it('the refusal names the user — whoever reads the message owns the session', async () => {
    const user = aUser([]);

    await expect(pipeFinding(null).pipe.transform(user)).rejects.toThrow(
      new RegExp(String(user.id)),
    );
  });
});
