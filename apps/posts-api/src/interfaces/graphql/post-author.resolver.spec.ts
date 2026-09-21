import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import type { QueryBus } from '@nestjs/cqrs';
import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import { User } from '@nestposts/users/domain/user/user.entity';
import { AUTHOR_ROLE, Author, Authorship } from '@nestposts/users/domain/user/author.entity';
import { NotAnAuthorException } from '@nestposts/users/domain/user/exception/not-an-author.exception';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { AuthorView } from '../../dto/graphql/user.view';
import { PostView } from '../../dto/graphql/post.view';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';
import { PostAuthorResolver } from './post-author.resolver';

describe('PostAuthorResolver', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostEntitySchema, TagSchema, UserEntitySchema, AuthorshipEntitySchema],
      }),
    );
  });

  afterAll(() => orm.close());

  const authorId = UserId.parse('3a7b1c2d-4e5f-4a6b-8c9d-0e1f2a3b4c5d');
  const now = new Date('2026-09-08T12:00:00.000Z');

  const anAuthor = (): Author => {
    const user = User.register(authorId, { email: 'manuel@example.com', name: 'manuel' }, [AUTHOR_ROLE], now);
    return Author.cast(user, Authorship.of(user));
  };

  const aPostView = () =>
    new PostView({
      id: PostId.generate(),
      title: 'um post',
      content: 'conteúdo',
      authorId: authorId.value,
      createdAt: now,
      updatedAt: now,
      version: 1,
      tags: [],
    });

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new PostAuthorResolver(bus), dispatched };
  };

  it('despacha FindAuthor com o authorId da view, como value object', async () => {
    const { resolver, dispatched } = resolverOn(anAuthor());

    await resolver.author(aPostView());

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(FindAuthorQuery.FindAuthor);
    expect((dispatched[0] as FindAuthorQuery.FindAuthor).authorId.equals(authorId)).toBe(true);
  });

  it('devolve o autor que o handler achou, sem tocá-lo', async () => {
    const author = anAuthor();
    const { resolver } = resolverOn(author);

    const found = await resolver.author(aPostView());

    expect(found).toBe(author);
  });

  it('um autor que não está mais lá é um erro, e não um null', async () => {
    const { resolver } = resolverOn(null);

    await expect(resolver.author(aPostView())).rejects.toThrow(NotAnAuthorException);
  });

  it('o erro nomeia o autor que faltou', async () => {
    const { resolver } = resolverOn(null);

    await expect(resolver.author(aPostView())).rejects.toThrow(authorId.value);
  });
});
