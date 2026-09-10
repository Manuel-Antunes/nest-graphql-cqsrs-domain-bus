import type { QueryBus } from '@nestjs/cqrs';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { UserId } from '../../domain/user/vo/user-id';
import { PostView } from '../../dto/graphql/post.view';
import { TagView } from '../../dto/graphql/tag.view';
import { PostViewMapper } from '../mapper/post-view.mapper';
import { PostQueryResolver } from './post-query.resolver';

/**
 * A borda de leitura, isolada: nem banco nem GraphQL. O `QueryBus` e o `PostViewMapper` são duplos,
 * porque o que este resolver faz é exatamente **tradução em dois sentidos** — e é isso que se afirma:
 *
 * - argumento do protocolo → mensagem do `QueryBus` (`id: string` → `FindPost(PostId)`);
 * - resultado → `PostConnection` da spec de Relay.
 *
 * A cursor connection é o ponto delicado: os cursores de cada edge saem de `page.from(post)`, e o
 * `pageInfo` dos flags que o **ORM** já calculou (`hasPrevPage`, e não uma conta refeita aqui). Um
 * `hasNextPage` inventado pelo resolver seria uma paginação que mente — e é essa a regressão que os
 * testes abaixo prendem.
 */
describe('PostQueryResolver', () => {
  const mapper = new PostViewMapper();
  const id = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');

  /** O que o `FindPost` devolve é a entidade; aqui só interessa que o mapper a receba. */
  const aPost = (postId = id) => ({ postId }) as unknown as Post;

  const aView = (postId: PostId) =>
    new PostView({
      id: postId.value,
      title: 'um post',
      content: 'conteúdo',
      authorId: UserId.generate().value,
      createdAt: new Date('2026-09-08T12:00:00.000Z'),
      updatedAt: new Date('2026-09-08T12:00:00.000Z'),
      version: 1,
      tags: [new TagView({ id: '5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f', name: 'Untagged' })],
    });

  /** Um `QueryBus` que grava o que foi despachado e devolve o que o teste combinar. */
  const busReturning = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { bus, dispatched };
  };

  const resolverOn = (result: unknown) => {
    const { bus, dispatched } = busReturning(result);
    const view = vi.spyOn(mapper, 'fromPost').mockImplementation((post) => aView((post as any).postId));
    return { resolver: new PostQueryResolver(bus, mapper), dispatched, view };
  };

  afterEach(() => vi.restoreAllMocks());

  describe('post(id)', () => {
    it('traduz o id do protocolo em FindPost com o value object', async () => {
      // Arrange
      const { resolver, dispatched } = resolverOn(aPost());

      // Act
      await resolver.post(id.value);

      // Assert
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]).toBeInstanceOf(FindPostQuery.FindPost);
      expect((dispatched[0] as FindPostQuery.FindPost).postId.equals(id)).toBe(true);
    });

    it('devolve a view do que o handler achou', async () => {
      // Arrange
      const { resolver, view } = resolverOn(aPost());

      // Act
      const result = await resolver.post(id.value);

      // Assert
      expect(view).toHaveBeenCalledOnce();
      expect(result?.id.equals(id)).toBe(true);
    });

    /** `post(id)` é `nullable` no schema: não achar não é erro, é `null`. */
    it('um post que não existe vira null, e o mapper nem é chamado', async () => {
      // Arrange
      const { resolver, view } = resolverOn(null);

      // Act
      const result = await resolver.post(id.value);

      // Assert
      expect(result).toBeNull();
      expect(view).not.toHaveBeenCalled();
    });

    it('um id que não é UUID é recusado antes de virar mensagem', async () => {
      // Arrange
      const { resolver, dispatched } = resolverOn(aPost());

      // Act / Assert
      await expect(resolver.post('nem-uuid')).rejects.toThrow();
      expect(dispatched).toEqual([]);
    });
  });

  describe('posts(first, after)', () => {
    /** O `Cursor` do MikroORM, no mínimo que o resolver usa dele. */
    const aPage = (overrides: Partial<Record<string, unknown>> = {}) => ({
      items: [aPost(id), aPost(PostId.parse('11111111-2222-4333-8444-555555555555'))],
      from: (post: Post) => `cursor:${(post as any).postId.value}`,
      hasNextPage: true,
      hasPrevPage: false,
      startCursor: 'inicio',
      endCursor: 'fim',
      totalCount: 42,
      ...overrides,
    });

    /**
     * O resolver repassa os argumentos como vieram; quem preenche o tamanho padrão é a **mensagem**
     * (`FindAllPosts`), não a borda. É o que mantém o default igual para qualquer transporte que
     * despache a mesma query.
     */
    it('repassa first e after como vieram, e o default de página é da mensagem', async () => {
      // Arrange
      const { resolver, dispatched } = resolverOn(aPage());

      // Act
      await resolver.posts(2, 'cursor-anterior');
      await resolver.posts();

      // Assert
      expect(dispatched[0]).toBeInstanceOf(FindAllPostsQuery.FindAllPosts);
      expect(dispatched[0]).toMatchObject({ first: 2, after: 'cursor-anterior' });
      expect(dispatched[1]).toMatchObject({ first: 20, after: undefined });
    });

    it('cada edge leva o cursor que o ORM deu para aquele item', async () => {
      // Arrange
      const { resolver } = resolverOn(aPage());

      // Act
      const connection = await resolver.posts(2);

      // Assert
      expect(connection.edges.map((edge) => edge.cursor)).toEqual([
        `cursor:${id.value}`,
        'cursor:11111111-2222-4333-8444-555555555555',
      ]);
      expect(connection.edges[0].node).toBeInstanceOf(PostView);
    });

    /**
     * `hasPreviousPage` vem do `hasPrevPage` do ORM, e não de uma conta local com o `after`. São
     * nomes diferentes para a mesma coisa, e o mapeamento entre eles é exatamente o que pode quebrar.
     */
    it('o pageInfo é o que o ORM calculou, sem conta refeita aqui', async () => {
      // Arrange
      const { resolver } = resolverOn(aPage({ hasNextPage: false, hasPrevPage: true }));

      // Act
      const connection = await resolver.posts(2, 'algum-cursor');

      // Assert
      expect(connection.pageInfo).toEqual({
        hasNextPage: false,
        hasPreviousPage: true,
        startCursor: 'inicio',
        endCursor: 'fim',
      });
      expect(connection.totalCount).toBe(42);
    });

    it('uma página vazia é uma connection vazia, não um erro', async () => {
      // Arrange
      const { resolver } = resolverOn(
        aPage({ items: [], hasNextPage: false, startCursor: null, endCursor: null, totalCount: 0 }),
      );

      // Act
      const connection = await resolver.posts();

      // Assert
      expect(connection.edges).toEqual([]);
      expect(connection.totalCount).toBe(0);
      expect(connection.pageInfo).toMatchObject({ hasNextPage: false, startCursor: null, endCursor: null });
    });
  });
});
