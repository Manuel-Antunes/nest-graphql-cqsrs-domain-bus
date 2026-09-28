import type { MikroORM } from '@mikro-orm/core';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';

import { AUTHOR_ROLE, Author, Authorship } from '../domain/user/author.entity';
import type { AuthorRepository } from '../domain/user/author.repository';
import { NotAnAuthorException } from '../domain/user/exception/not-an-author.exception';
import { User } from '../domain/user/user.entity';
import { UserId } from '../domain/user/vo/user-id';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '../infrastructure/persistence/entities/user-orm.entity';
import { AuthorPipe } from './author.pipe';

describe('AuthorPipe', () => {
  let orm: MikroORM;
  const now = new Date('2026-09-08T12:00:00.000Z');

  beforeAll(async () => {
    orm = await testDatabase({
      entities: [UserEntitySchema, AuthorshipEntitySchema],
    });
  });

  afterAll(() => closeTestDatabase(orm));

  const pipeFinding = (author: Author | null) => {
    const asked: UserId[] = [];
    const authors = {
      findById: (id: UserId) => {
        asked.push(id);
        return Promise.resolve(author);
      },
    } as unknown as AuthorRepository;
    return { pipe: new AuthorPipe(authors), asked };
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
    const { pipe, asked } = pipeFinding(anAuthor(user));

    await pipe.transform(user);

    expect(asked[0]).toBeInstanceOf(UserId);
    expect(asked[0].equals(user.id)).toBe(true);
  });

  it('hands back what the repository found, already an Author', async () => {
    const user = aUser([AUTHOR_ROLE]);
    const author = anAuthor(user);

    expect(await pipeFinding(author).pipe.transform(user)).toBe(author);
  });

  it('refuses a user without the author role, and does not even ask', async () => {
    const user = aUser([]);
    const { pipe, asked } = pipeFinding(null);

    await expect(pipe.transform(user)).rejects.toThrow(NotAnAuthorException);
    expect(asked).toEqual([]);
  });

  it('the role alone is not enough: without the delegate row there is nothing to cast over', async () => {
    const user = aUser([AUTHOR_ROLE]);
    const { pipe, asked } = pipeFinding(null);

    await expect(pipe.transform(user)).rejects.toThrow(NotAnAuthorException);
    expect(asked).toHaveLength(1);
  });

  it('the refusal names the user — whoever reads the message owns the session', async () => {
    const user = aUser([]);

    await expect(pipeFinding(null).pipe.transform(user)).rejects.toThrow(
      new RegExp(String(user.id)),
    );
  });
});
