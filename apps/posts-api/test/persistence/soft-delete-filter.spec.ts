import { MikroORM } from '@mikro-orm/core';
import {
  closeTestDatabase,
  tableIn,
  testDatabase,
} from '@nestposts/database/testing';
import { delegateRef } from '@nestposts/platform/domain/shared/delegation/delegate';
import { SoftDeletion } from '@nestposts/platform/domain/shared/soft-delete/soft-delete';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';
import { ACTIVE_FILTER } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete-orm.entity';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import {
  AUTHOR_ROLE,
  Author,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

describe('o filtro de ativos', () => {
  const T0 = new Date('2026-09-08T12:00:00.000Z');

  let orm: MikroORM;

  beforeAll(async () => {
    orm = await testDatabase({
      entities: [
        PostEntitySchema,
        TagSchema,
        UserEntitySchema,
        AuthorshipEntitySchema,
      ],
      subscribers: [new SoftDeleteSubscriber()],
    });
  });

  afterAll(() => closeTestDatabase(orm));

  const now = T0;

  const givenAnAuthor = async (): Promise<User> => {
    const em = orm.em.fork();
    const user = User.register(
      UserId.generate(),
      { email: `autor+${UserId.generate()}@example.com`, name: 'manuel' },
      [AUTHOR_ROLE],
      now,
    );
    user.uncommit();
    await em.persist(user).persist(Authorship.of(user)).flush();
    return user;
  };

  const givenAPost = async (author: User) => {
    const em = orm.em.fork();
    const authorship = await em.findOneOrFail(Authorship, { user: author.id });
    const post = Post.create(
      PostId.generate(),
      { title: 'um post', content: 'oi' },
      delegateRef(Author, authorship),
      delegateRef(Author, authorship).delegated().name,
      now,
    );
    post.uncommit();
    await em.persist(post).flush();
    return post.id;
  };

  it('uma entidade viva volta do banco com o value object montado, e não nulo', async () => {
    const author = await givenAnAuthor();
    const id = await givenAPost(author);

    const post = await orm.em.fork().findOneOrFail(Post, { id });

    expect(post.deleted).toBeInstanceOf(SoftDeletion);
    expect(post.isDeleted()).toBe(false);
    expect(post.deletedAt).toBeNull();
  });

  it('a coluna continua guardando a data, na própria tabela do agregado', async () => {
    const author = await givenAnAuthor();
    const id = await givenAPost(author);
    const em = orm.em.fork();

    const post = await em.findOneOrFail(Post, { id });
    post.softDelete(now);
    await em.flush();

    const [row] = await orm.em
      .fork()
      .getConnection()
      .execute(`select deleted_at from ${tableIn(orm, 'posts')} where id = ?`, [
        id.value,
      ]);
    expect(row.deleted_at).toBeTruthy();
  });

  it('some das consultas sem sumir do banco', async () => {
    const author = await givenAnAuthor();
    const id = await givenAPost(author);

    const em = orm.em.fork();
    const post = await em.findOneOrFail(Post, { id });
    post.softDelete(now);
    await em.flush();

    expect(await orm.em.fork().findOne(Post, { id })).toBeNull();
    const withDeleted = await orm.em
      .fork()
      .findOne(Post, { id }, { filters: { [ACTIVE_FILTER]: false } });
    expect(withDeleted?.isDeleted()).toBe(true);
    expect(withDeleted?.deletedAt).toEqual(now);
  });

  it('restaurar traz de volta às consultas', async () => {
    const author = await givenAnAuthor();
    const id = await givenAPost(author);

    const deleting = orm.em.fork();
    const post = await deleting.findOneOrFail(Post, { id });
    post.softDelete(now);
    await deleting.flush();

    const restoring = orm.em.fork();
    const deleted = await restoring.findOneOrFail(
      Post,
      { id },
      { filters: { [ACTIVE_FILTER]: false } },
    );
    deleted.restore(new Date());
    await restoring.flush();

    expect(await orm.em.fork().findOne(Post, { id })).not.toBeNull();
  });

  it('apagar o autor esconde os posts dele, sem tocar nas linhas de post', async () => {
    const author = await givenAnAuthor();
    const id = await givenAPost(author);

    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { id: author.id });
    user.softDelete(now);
    await em.flush();

    expect(await orm.em.fork().findOne(Post, { id })).toBeNull();
    const [row] = await orm.em
      .fork()
      .getConnection()
      .execute(`select deleted_at from ${tableIn(orm, 'posts')} where id = ?`, [
        id.value,
      ]);
    expect(row.deleted_at).toBeNull();
  });
});
