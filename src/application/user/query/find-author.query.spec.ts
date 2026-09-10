import { MikroORM } from '@mikro-orm/core';
import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, inRequestContext } from '../../../../test/support/cqrs-testing-module';
import { givenAnAuthor, givenAPost, givenAReader, T0 } from '../../../../test/support/post-fixtures';
import { FindAllPostsQuery } from '../../post/query/find-all-posts.query';
import { Author } from '../../../domain/user/author.entity';
import { UserId } from '../../../domain/user/vo/user-id';
import { FindAuthorQuery } from './find-author.query';

/**
 * O autor de um post, pelo id — o que serve o campo `Post.author`.
 *
 * Dois testes aqui não são sobre o resultado, e são os mais importantes:
 *
 * - **quantas consultas** a resolução custa numa leitura. A resposta é zero, e a razão é o
 *   `populate: ['tags', 'author']` do repositório: o autor já está no identity map da requisição. Essa
 *   é a frase que está escrita no `PostAuthorResolver`, no `post-author.graphql` e no README — e uma
 *   frase assim precisa de algo que a quebre quando deixar de ser verdade;
 * - **se funciona sem contexto de requisição**, que é o caminho da subscription: a view nasce do
 *   evento, dentro de um WebSocket, e não há middleware do Express por baixo.
 */
describe('FindAuthorQuery.Handler', () => {
  let module: TestingModule;
  let handler: FindAuthorQuery.Handler;
  let orm: MikroORM;

  /** Conta os SELECTs que chegam ao driver — o único lugar onde uma consulta é indiscutível. */
  const countingSelects = () => {
    const selects: string[] = [];
    const connection = orm.em.getConnection() as unknown as { execute: (...args: unknown[]) => unknown };
    const original = connection.execute.bind(connection);
    connection.execute = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && /^\s*select/i.test(args[0])) {
        selects.push(args[0]);
      }
      return original(...args);
    };
    return { selects, restore: () => void (connection.execute = original) };
  };

  beforeEach(async () => {
    module = await createCqrsTestingModule([FindAuthorQuery.Handler, FindAllPostsQuery.Handler]);
    handler = module.get(FindAuthorQuery.Handler);
    orm = module.get(MikroORM);
  });

  afterEach(() => module.close());

  it('devolve o Author, já com o tipo concreto', async () => {
    const author = await givenAnAuthor(module, 'autora@example.com', 'manuel');

    const found = await inRequestContext(module, () =>
      handler.execute(new FindAuthorQuery.FindAuthor(author.id)),
    );

    expect(found).toBeInstanceOf(Author);
    expect(found!.name.value).toBe('manuel');
    expect(found!.email.value).toBe('autora@example.com');
  });

  /**
   * Um Reader e um id inexistente saem pelo mesmo `null`, de propósito: distinguir os dois daria a quem
   * perguntasse um oráculo de quais ids existem.
   */
  it('um Reader e um id desconhecido são o mesmo null', async () => {
    const reader = await givenAReader(module);

    const asReader = await inRequestContext(module, () =>
      handler.execute(new FindAuthorQuery.FindAuthor(reader.id)),
    );
    const unknown = await inRequestContext(module, () =>
      handler.execute(new FindAuthorQuery.FindAuthor(UserId.generate())),
    );

    expect(asReader).toBeNull();
    expect(unknown).toBeNull();
  });

  /**
   * O ponto: numa leitura, resolver `Post.author` é **de graça**. O repositório popula o autor junto do
   * post, então ele já está no identity map daquele EntityManager e o `findById` é servido de memória.
   *
   * O controle no fim é o que dá sentido à contagem: um autor que **não** passou por ali custa uma
   * consulta, então o zero de cima é o identity map a funcionar, e não o contador a falhar.
   */
  it('resolver o autor de uma página de posts custa ZERO consultas', async () => {
    const [umaPessoa, outraPessoa] = [await givenAnAuthor(module), await givenAnAuthor(module)];
    for (const [index, author] of [umaPessoa, outraPessoa, umaPessoa].entries()) {
      await givenAPost(module, { title: `p${index}`, author, createdAt: new Date(T0.getTime() + index * 1000) });
    }
    const naoLido = await givenAnAuthor(module);

    await inRequestContext(module, async () => {
      const page = await module
        .get(FindAllPostsQuery.Handler)
        .execute(new FindAllPostsQuery.FindAllPosts(10));
      const counter = countingSelects();

      for (const post of page.items) {
        expect(await handler.execute(new FindAuthorQuery.FindAuthor(post.author.id))).toBeInstanceOf(Author);
      }

      expect(page.items).toHaveLength(3);
      expect(counter.selects).toHaveLength(0);

      // Controle: um autor que o populate não trouxe precisa de consulta — o contador conta.
      await handler.execute(new FindAuthorQuery.FindAuthor(naoLido.id));
      expect(counter.selects.length).toBeGreaterThan(0);
      counter.restore();
    });
  });

  /**
   * O caminho da **subscription**: a view nasce do payload do evento, dentro de um WebSocket, onde o
   * middleware do Express nunca correu. Sem o `inRequestContext` no adapter, isto estoura com
   * "Using global EntityManager instance methods … is disallowed" — e o cliente recebe um `data: null`
   * em vez do post.
   *
   * Repare que a chamada aqui **não** está envolvida em `inRequestContext`: é essa ausência que é o
   * teste.
   */
  it('funciona fora de qualquer contexto de requisição — o caminho do WebSocket', async () => {
    const author = await givenAnAuthor(module);

    const found = await handler.execute(new FindAuthorQuery.FindAuthor(author.id));

    expect(found).toBeInstanceOf(Author);
    expect(found!.id.equals(author.id)).toBe(true);
  });
});
