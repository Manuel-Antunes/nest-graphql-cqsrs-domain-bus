import { MikroORM, ref } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { PostEntitySchema } from '../../infrastructure/persistence/sqlite/entities/post-orm.entity';
import { TagSchema } from '../../infrastructure/persistence/sqlite/entities/tag-orm.entity';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '../../infrastructure/persistence/sqlite/entities/user-orm.entity';
import { Post } from '../post/post.entity';
import { PostId } from '../post/vo/post-id';
import { delegateRef } from '../shared/delegation/delegate';
import { AUTHOR_ROLE, Author, Authorship } from './author.entity';
import { User } from './user.entity';
import { UserId } from './vo/user-id';

describe('Author: the user, cast over its authorship', () => {
  let orm: MikroORM;
  const now = new Date('2026-09-08T12:00:00.000Z');

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostEntitySchema, TagSchema, UserEntitySchema, AuthorshipEntitySchema],
        ensureDatabase: { create: true },
      }),
    );
  });

  afterAll(() => orm.close(true));

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

  const givenAnAuthorWith = async (titles: readonly string[]): Promise<UserId> => {
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
    delegateRef(Author, await orm.em.fork().findOneOrFail(Authorship, { user: id })).delegated();

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

    const author = Author.cast(user, await em.findOneOrFail(Authorship, { user: id }));

    expect(author.equals(plain)).toBe(true);
    expect(plain.equals(author)).toBe(true);
  });

  it('the collection starts uninitialized — loading is a decision, not the default', async () => {
    const author = await loadAuthor(await givenAnAuthorWith(['a', 'b', 'c']));

    expect(author.authorship.posts.isInitialized()).toBe(false);
  });

  it('posted returns a page, newest first', async () => {
    const author = await loadAuthor(await givenAnAuthorWith(['primeiro', 'segundo', 'terceiro']));

    const page = await author.posted({ limit: 2 });

    expect(page.map((post) => post.title.value)).toEqual(['terceiro', 'segundo']);
  });

  it('posted paginates by offset', async () => {
    const author = await loadAuthor(await givenAnAuthorWith(['primeiro', 'segundo', 'terceiro']));

    const page = await author.posted({ limit: 2, offset: 2 });

    expect(page.map((post) => post.title.value)).toEqual(['primeiro']);
  });

  it('paginating does not initialize the collection', async () => {
    const author = await loadAuthor(await givenAnAuthorWith(['a', 'b', 'c']));

    await author.posted({ limit: 1 });

    expect(author.authorship.posts.isInitialized()).toBe(false);
  });

  it('postCount is a count, not the size of a loaded list', async () => {
    const author = await loadAuthor(await givenAnAuthorWith(['a', 'b', 'c']));

    const total = await author.postCount();

    expect(total).toBe(3);
    expect(author.authorship.posts.isInitialized()).toBe(false);
  });

  it('wrote answers by identity, without touching the collection', async () => {
    const mine = await loadAuthor(await givenAnAuthorWith(['meu']));
    const theirs = await loadAuthor(await givenAnAuthorWith(['deles']));
    const [myPost] = await mine.posted({ limit: 1 });
    const [theirPost] = await theirs.posted({ limit: 1 });

    expect(mine.wrote(myPost)).toBe(true);
    expect(mine.wrote(theirPost)).toBe(false);
    expect(mine.authorship.posts.isInitialized()).toBe(false);
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
    const post = await em.findOneOrFail(Post, { author: await givenAnAuthorWith(['outro']) });
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
