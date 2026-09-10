import { MikroORM, ref } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { PostSchema } from '../../infrastructure/persistence/sqlite/entities/post-orm.entity';
import { TagSchema } from '../../infrastructure/persistence/sqlite/entities/tag-orm.entity';
import {
  AuthorSchema,
  ReaderSchema,
  UserSchema,
} from '../../infrastructure/persistence/sqlite/entities/user-orm.entity';
import { Post } from '../post/post.entity';
import { PostId } from '../post/vo/post-id';
import { Author } from './author.entity';
import { AUTHOR_ROLE } from './user.entity';
import { Users } from './user.factory';
import { UserId } from './vo/user-id';

/**
 * Os posts vistos do lado do autor.
 *
 * O que estes testes defendem não é só que a coleção funciona — é que ela **não** carrega tudo. A
 * versão Java desta aplicação não tem esta coleção justamente por esse medo ("um autor produtivo tem
 * milhares de posts, e uma coleção mapeada é um convite a carregar todos"). Ter a coleção e não
 * aceitar o convite é o contrato do `Author`, e é o que está travado aqui.
 */
describe('Author e os posts dele', () => {
  let orm: MikroORM;
  const now = new Date('2026-09-08T12:00:00.000Z');

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema],
        ensureDatabase: { create: true },
      }),
    );
  });

  afterAll(() => orm.close(true));

  /** Um autor com N posts, escritos em instantes crescentes para a ordem ser observável. */
  const givenAnAuthorWith = async (titles: string[]): Promise<UserId> => {
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
    // O autor primeiro: a chave estrangeira de `posts.author_id` aponta para `authors`, e a linha da
    // subclasse precisa existir antes. Na produção isso é dado — o autor vem da sessão.
    await em.persist(user).flush();

    const writing = orm.em.fork();
    const author = await writing.findOneOrFail(Author, { id: user.id });
    titles.forEach((title, i) => {
      const at = new Date(now.getTime() + i * 1000);
      const post = Post.create(PostId.generate(), { title, content: 'oi' }, ref(author), author.name, at);
      post.uncommit();
      writing.persist(post);
    });
    await writing.flush();
    return user.id;
  };

  const loadAuthor = async (id: UserId): Promise<Author> => {
    const user = await orm.em.fork().findOneOrFail(Author, { id });
    return user;
  };

  it('a coleção nasce não inicializada — carregar é uma decisão, não o padrão', async () => {
    const id = await givenAnAuthorWith(['a', 'b', 'c']);

    const author = await loadAuthor(id);

    expect(author.posts.isInitialized()).toBe(false);
  });

  it('posted devolve uma página, do mais recente para o mais antigo', async () => {
    const id = await givenAnAuthorWith(['primeiro', 'segundo', 'terceiro']);
    const author = await loadAuthor(id);

    const page = await author.posted({ limit: 2 });

    expect(page.map((post) => post.title.value)).toEqual(['terceiro', 'segundo']);
  });

  it('posted pagina pelo offset', async () => {
    const id = await givenAnAuthorWith(['primeiro', 'segundo', 'terceiro']);
    const author = await loadAuthor(id);

    const page = await author.posted({ limit: 2, offset: 2 });

    expect(page.map((post) => post.title.value)).toEqual(['primeiro']);
  });

  /** O ponto todo: a página vai ao banco com `limit`, e a coleção continua sem ter carregado nada. */
  it('paginar não inicializa a coleção', async () => {
    const id = await givenAnAuthorWith(['a', 'b', 'c']);
    const author = await loadAuthor(id);

    await author.posted({ limit: 1 });

    expect(author.posts.isInitialized()).toBe(false);
  });

  it('postCount é um count, não o tamanho de uma lista carregada', async () => {
    const id = await givenAnAuthorWith(['a', 'b', 'c']);
    const author = await loadAuthor(id);

    const total = await author.postCount();

    expect(total).toBe(3);
    expect(author.posts.isInitialized()).toBe(false);
  });

  it('wrote responde por identidade, sem tocar a coleção', async () => {
    const mine = await givenAnAuthorWith(['meu']);
    const theirs = await givenAnAuthorWith(['deles']);
    const author = await loadAuthor(mine);
    const [myPost] = await author.posted({ limit: 1 });
    const [theirPost] = await (await loadAuthor(theirs)).posted({ limit: 1 });

    expect(author.wrote(myPost)).toBe(true);
    expect(author.wrote(theirPost)).toBe(false);
    expect(author.posts.isInitialized()).toBe(false);
  });

  it('a coleção é do Author, não do User: um Reader não tem essa porta', async () => {
    const id = await givenAnAuthorWith([]);

    const author = await loadAuthor(id);

    expect(author).toBeInstanceOf(Author);
    expect(author.canWritePosts()).toBe(true);
    expect(await author.postCount()).toBe(0);
  });
});
