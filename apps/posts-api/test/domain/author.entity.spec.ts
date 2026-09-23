import { MikroORM, ref } from '@mikro-orm/core';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { delegateRef } from '@nestposts/platform/domain/shared/delegation/delegate';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import {
  Author,
  AUTHOR_ROLE,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

describe('Author: the user, cast over its authorship', () => {
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

  const givenAUser = async (roles: readonly string[]): Promise<UserId> => {
    const em = orm.em.fork();
    const user = User.register(
      UserId.generate(),
      { email: `autor+${UserId.generate()}@example.com`, name: 'manuel' },
      roles,
      now,
    );
    user.uncommit();
    em.persist(user);
    if (roles.includes(AUTHOR_ROLE)) {
      em.persist(Authorship.of(user));
    }
    await em.flush();
    return user.id;
  };

  const givenAnAuthorWith = async (
    titles: readonly string[],
  ): Promise<UserId> => {
    const id = await givenAUser([AUTHOR_ROLE]);
    const em = orm.em.fork();
    const authorship = await em.findOneOrFail(Authorship, { user: id });
    titles.forEach((title, index) => {
      const post = Post.create(
        PostId.generate(),
        { title, content: 'oi' },
        delegateRef(Author, authorship),
        delegateRef(Author, authorship).delegated().name,
        new Date(now.getTime() + index * 1000),
      );
      post.uncommit();
      em.persist(post);
    });
    await em.flush();
    return id;
  };

  const loadAuthor = async (id: UserId): Promise<Author> =>
    delegateRef(
      Author,
      await orm.em.fork().findOneOrFail(Authorship, { user: id }),
    ).delegated();

  it('casting keeps the very same object: the user gained a capability, not an identity', async () => {
    const id = await givenAUser([AUTHOR_ROLE]);
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { id });
    const authorship = await em.findOneOrFail(Authorship, { user: id });

    const author = Author.cast(user, authorship);

    expect(author).toBe(user);
    expect(author).toBeInstanceOf(Author);
    expect(author).toBeInstanceOf(User);
    expect(author.id.equals(id)).toBe(true);
    expect(author.name.value).toBe('manuel');
    expect(author.authorship).toBe(authorship);
  });

  it('the delegate answers, and the user still equals itself across the cast', async () => {
    const id = await givenAUser([AUTHOR_ROLE]);
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { id });
    const plain = await orm.em.fork().findOneOrFail(User, { id });

    const author = Author.cast(
      user,
      await em.findOneOrFail(Authorship, { user: id }),
    );

    expect(author.equals(plain)).toBe(true);
    expect(plain.equals(author)).toBe(true);
  });

  it('an unloaded reference loads the whole chain and lands on the Author', async () => {
    const id = await givenAnAuthorWith(['um post']);
    const em = orm.em.fork();
    const post = await em.findOneOrFail(Post, { author: id });
    expect(post.author.isInitialized()).toBe(false);

    const author = await post.author.loadDelegated();

    expect(author).toBeInstanceOf(Author);
    expect(author!.id.equals(id)).toBe(true);
    expect(author!.name.value).toBe('manuel');
  });

  it('a reference to an authorship that is not there resolves to null', async () => {
    const em = orm.em.fork();
    const post = await em.findOneOrFail(Post, {
      author: await givenAnAuthorWith(['outro']),
    });
    const dangling = delegateRef(Author, UserId.generate());

    expect(await dangling.loadDelegated()).toBeNull();
    expect(await post.author.loadDelegated()).toBeInstanceOf(Author);
  });

  it('a user with no authorship row is just a user — there is nothing to cast over', async () => {
    const id = await givenAUser([]);

    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { id });

    expect(user).not.toBeInstanceOf(Author);
    expect(user.hasRole(AUTHOR_ROLE)).toBe(false);
    expect(await em.findOne(Authorship, { user: id })).toBeNull();
  });
});
