import { MikroORM, ref } from '@mikro-orm/core';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { BrokenDelegationException } from '@nestposts/platform/domain/shared/delegation/broken-delegation.exception';
import { delegateRef } from '@nestposts/platform/domain/shared/delegation/delegate';
import { referencesServeDelegations } from '@nestposts/platform/infrastructure/persistence/delegation/delegated-reference';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
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

describe('a referência de um delegado serve o id do sujeito', () => {
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

  const givenAPost = async (): Promise<{ postId: PostId; userId: UserId }> => {
    const em = orm.em.fork();
    const user = User.register(
      UserId.generate(),
      { email: `autor+${UserId.generate()}@example.com`, name: 'manuel' },
      [AUTHOR_ROLE],
      now,
    );
    user.uncommit();
    const authorship = Authorship.of(user);
    const post = Post.create(
      PostId.generate(),
      { title: 'um post', content: 'oi' },
      delegateRef(Author, authorship),
      user.name,
      now,
    );
    post.uncommit();
    await em.persist(user).persist(authorship).persist(post).flush();
    return { postId: post.id, userId: user.id };
  };

  it('a chave primária da linha delegada é uma relação, e mesmo assim `.id` responde', async () => {
    const { postId, userId } = await givenAPost();

    const post = await orm.em.fork().findOneOrFail(Post, { id: postId });

    expect(post.author.isInitialized()).toBe(false);
    expect(post.author.id).toBeInstanceOf(UserId);
    expect(post.author.id.equals(userId)).toBe(true);
  });

  it('uma referência montada a partir de um id cru também responde, sem tocar o banco', () => {
    const userId = UserId.generate();

    expect(delegateRef(Author, userId).id.equals(userId)).toBe(true);
  });

  it('a referência de uma entidade comum continua a devolver o id dela', async () => {
    const em = orm.em.fork();
    const tag = Tag.create(TagId.generate(), 'dev', now);
    tag.uncommit();
    await em.persist(tag).flush();

    const tagRef = ref(await em.findOneOrFail(Tag, { id: tag.id }));

    expect(tagRef.id.equals(tag.id)).toBe(true);
  });

  it('delegated() devolve o Author castado, e loadDelegated() carrega antes de castar', async () => {
    const { postId, userId } = await givenAPost();
    const post = await orm.em
      .fork()
      .findOneOrFail(Post, { id: postId }, { populate: ['author'] });

    const author = post.author.delegated();

    expect(author).toBeInstanceOf(Author);
    expect(author.id.equals(userId)).toBe(true);
    expect(await post.author.loadDelegated()).toBe(author);
  });

  it('a referência de uma entidade que não é delegado nenhum recusa o cast', async () => {
    const em = orm.em.fork();
    const tag = Tag.create(TagId.generate(), 'ops', now);
    tag.uncommit();
    await em.persist(tag).flush();

    const tagRef = ref(await em.findOneOrFail(Tag, { id: tag.id }));

    expect(() =>
      (tagRef as never as { delegated(): unknown }).delegated(),
    ).toThrow(BrokenDelegationException);
  });

  it('instalar duas vezes não estraga o que já está lá', async () => {
    const { postId, userId } = await givenAPost();

    referencesServeDelegations();
    const post = await orm.em.fork().findOneOrFail(Post, { id: postId });

    expect(post.author.id.equals(userId)).toBe(true);
  });
});
