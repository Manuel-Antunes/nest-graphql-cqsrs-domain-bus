import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, inRequestContext } from '../../../../test/support/cqrs-testing-module';
import { givenAnAuthor, givenAPost, T0 } from '../../../../test/support/post-fixtures';
import type { Author } from '../../../domain/user/author.entity';
import { UserId } from '../../../domain/user/vo/user-id';
import { FindPostsByAuthorQuery } from './find-posts-by-author.query';

/**
 * A cursor connection de `Author.posts` contra o banco: o recorte por autor, a ordem **decrescente**
 * (que é o contrário de `posts`), e que as relações que a view precisa voltam populadas.
 *
 * Esse último ponto é o que justifica este método existir na porta em vez de o campo usar o
 * `Author.posted` do agregado: sem `populate`, `post.tags` volta não inicializada e o
 * `PostViewMapper.fromPost` estoura na borda — longe daqui, e num lugar onde a causa não aparece.
 */
describe('FindPostsByAuthorQuery.Handler', () => {
  let module: TestingModule;
  let handler: FindPostsByAuthorQuery.Handler;
  let author: Author;

  const page = (first?: number | null, after?: string | null) =>
    inRequestContext(module, () =>
      handler.execute(new FindPostsByAuthorQuery.FindPostsByAuthor(author.id, first, after)),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([FindPostsByAuthorQuery.Handler]);
    handler = module.get(FindPostsByAuthorQuery.Handler);
    author = await givenAnAuthor(module);
    for (const [index, title] of ['primeiro', 'segundo', 'terceiro'].entries()) {
      await givenAPost(module, { title, author, createdAt: new Date(T0.getTime() + index * 1000) });
    }
  });

  afterEach(() => module.close());

  it('devolve a página pedida, do mais recente para o mais antigo', async () => {
    const first = await page(2);

    expect(first.items.map((post) => post.title.value)).toEqual(['terceiro', 'segundo']);
    expect(first.hasNextPage).toBe(true);
    expect(first.hasPrevPage).toBe(false);
    expect(first.totalCount).toBe(3);
  });

  it('o endCursor de uma página é o after da seguinte', async () => {
    const first = await page(2);

    const second = await page(2, first.endCursor);

    expect(second.items.map((post) => post.title.value)).toEqual(['primeiro']);
    expect(second.hasNextPage).toBe(false);
    expect(second.hasPrevPage).toBe(true);
  });

  /**
   * O recorte é por chave estrangeira: os posts de outro autor não entram, e o `totalCount` conta só
   * os deste — um `count` sem o mesmo `where` seria o total da tabela.
   */
  it('não traz os posts de outro autor, nem os conta', async () => {
    const outro = await givenAnAuthor(module);
    await givenAPost(module, { title: 'de outra pessoa', author: outro });

    const mine = await page(10);

    expect(mine.items.map((post) => post.title.value)).toEqual(['terceiro', 'segundo', 'primeiro']);
    expect(mine.totalCount).toBe(3);
  });

  /** Um id que não é de autor nenhum devolve vazio — e não um erro que confirme quem existe. */
  it('um id desconhecido é uma página vazia', async () => {
    const empty = await inRequestContext(module, () =>
      handler.execute(new FindPostsByAuthorQuery.FindPostsByAuthor(UserId.generate(), 10)),
    );

    expect(empty.items).toEqual([]);
    expect(empty.totalCount).toBe(0);
    expect(empty.hasNextPage).toBe(false);
  });

  /**
   * As duas relações que o `PostViewMapper` lê: `tags` como coleção inicializada e `author` como
   * referência carregada. É o contrato que a borda depende, e por isso ele é afirmado aqui.
   */
  it('os posts voltam com tags e author populados, prontos para a view', async () => {
    const { items } = await page(1);

    expect(items[0].tags.isInitialized()).toBe(true);
    expect(items[0].author.isInitialized()).toBe(true);
    expect(items[0].author.getEntity().name.value).toBe(author.name.value);
  });

  it('sem first a página é a default, e o teto é o mesmo de posts', () => {
    const of = (first?: number | null) =>
      new FindPostsByAuthorQuery.FindPostsByAuthor(author.id, first).first;

    expect(of(undefined)).toBe(20);
    expect(of(0)).toBe(1);
    expect(of(10_000)).toBe(100);
  });
});
