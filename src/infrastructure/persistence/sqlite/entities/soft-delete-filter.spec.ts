import { MikroORM, ref } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { Post } from '../../../../domain/post/post.entity';
import { PostId } from '../../../../domain/post/vo/post-id';
import { AUTHOR_ROLE, User } from '../../../../domain/user/user.entity';
import { Users } from '../../../../domain/user/user.factory';
import { type Author } from '../../../../domain/user/author.entity';
import { UserId } from '../../../../domain/user/vo/user-id';
import { PostSchema } from './post-orm.entity';
import { ACTIVE_FILTER } from './soft-delete-orm.entity';
import { SoftDeleteSubscriber } from '../helpers/soft-delete.subscriber';
import { TagSchema } from './tag-orm.entity';
import { AuthorSchema, ReaderSchema, UserSchema } from './user-orm.entity';
import { SoftDeletion } from '../../../../domain/shared/soft-delete';

/**
 * O efeito do soft delete **nas consultas** — a metade que é de infraestrutura.
 *
 * O que os comentários do domínio sempre prometeram ("a linha fica, e o filtro de ativos a esconde")
 * só passou a ser verdade quando o filtro existiu. Estes testes são o contrato dessa promessa; as
 * regras do value object e do mixin ficam em `domain/shared/soft-delete.spec`.
 */
describe('o filtro de ativos', () => {
  const T0 = new Date('2026-09-08T12:00:00.000Z');

  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema],
        subscribers: [new SoftDeleteSubscriber()],
        ensureDatabase: { create: true },
      }),
    );
  });

  afterAll(() => orm.close(true));

  const now = T0;

  const givenAnAuthor = async (): Promise<Author> => {
    const em = orm.em.fork();
    const user = Users.register(
      UserId.generate(),
      { email: `autor+${UserId.generate()}@example.com`, name: 'manuel' },
      AUTHOR_ROLE,
      now,
    );
    if (!user.canWritePosts()) {
      throw new Error('AUTHOR_ROLE precisa nascer Author');
    }
    user.uncommit();
    await em.persist(user).flush();
    return user;
  };

  const givenAPost = async (author: Author) => {
    const em = orm.em.fork();
    const owner = await em.findOneOrFail(User, { id: author.id });
    if (!owner.canWritePosts()) {
      throw new Error('o autor precisa ser Author');
    }
    const post = Post.create(PostId.generate(), { title: 'um post', content: 'oi' }, ref(owner), owner.name, now);
    post.uncommit();
    await em.persist(post).flush();
    return post.id;
  };

  /**
   * A armadilha que a versão Java precisou guardar: o Hibernate deixa o `@Embedded` **nulo** quando
   * todas as colunas dele vêm nulas — que é o caso de toda entidade viva, já que `deleted_at` é a
   * única —, e por isso o `Post.softDeletion()` de lá reinstancia o holder na leitura.
   *
   * Aqui não é preciso, e este teste é a prova: com `forceConstructor: true` o MikroORM hidrata pelo
   * `new`, então o inicializador do campo roda e o value object existe antes de qualquer coluna ser
   * atribuída. É a mesma flag que já existia por causa da `Collection` de tags.
   */
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
      .execute('select deleted_at from posts where id = ?', [id.value]);
    expect(row.deleted_at).toBeTruthy();
  });

  it('some das consultas sem sumir do banco', async () => {
    const author = await givenAnAuthor();
    const id = await givenAPost(author);

    const em = orm.em.fork();
    const post = await em.findOneOrFail(Post, { id });
    post.softDelete(now);
    await em.flush();

    // filtrado por padrão…
    expect(await orm.em.fork().findOne(Post, { id })).toBeNull();
    // …e ainda lá, para quem pedir
    const withDeleted = await orm.em.fork().findOne(Post, { id }, { filters: { [ACTIVE_FILTER]: false } });
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
    const deleted = await restoring.findOneOrFail(Post, { id }, { filters: { [ACTIVE_FILTER]: false } });
    deleted.restore(new Date());
    await restoring.flush();

    expect(await orm.em.fork().findOne(Post, { id })).not.toBeNull();
  });

  /**
   * O efeito que o README chama de indireto, e que agora é verdade: apagar o autor tira os posts
   * dele das consultas **sem tocar em nenhuma linha de post**. Quem faz isso é o
   * `autoJoinRefsForFilters` do MikroORM (ligado por padrão), que junta a relação m:1 quando ela
   * tem filtro.
   */
  it('apagar o autor esconde os posts dele, sem tocar nas linhas de post', async () => {
    const author = await givenAnAuthor();
    const id = await givenAPost(author);

    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { id: author.id });
    user.softDelete(now);
    await em.flush();

    expect(await orm.em.fork().findOne(Post, { id })).toBeNull();
    // a linha do post continua ativa: quem sumiu foi o autor
    const [row] = await orm.em
      .fork()
      .getConnection()
      .execute('select deleted_at from posts where id = ?', [id.value]);
    expect(row.deleted_at).toBeNull();
  });
});
