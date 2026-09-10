import type { QueryBus } from '@nestjs/cqrs';
import { FindPostsByAuthorQuery } from '../../application/post/query/find-posts-by-author.query';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { UserId } from '../../domain/user/vo/user-id';
import { PostView } from '../../dto/graphql/post.view';
import { AuthorView } from '../../dto/graphql/user.view';
import { PostViewMapper } from '../mapper/post-view.mapper';
import { AuthorPostsResolver } from './author-posts.resolver';

/**
 * `Author.posts`, isolado: nem banco nem GraphQL. O que este resolver faz é tradução em dois sentidos,
 * e é isso que se afirma:
 *
 * - a `AuthorView` do parent → uma `FindPostsByAuthor` com o **value object** do id;
 * - o `Cursor` do ORM → a `PostConnection` da spec de Relay.
 *
 * O ponto delicado é o segundo: nenhum flag de `pageInfo` é conta deste resolver. Eles saem do
 * `Cursor` pelo `connectionOf`, e é isso que mantém esta connection e a de `Query.posts` contando a
 * mesma história.
 */
describe('AuthorPostsResolver', () => {
  const mapper = new PostViewMapper();
  const authorId = UserId.parse('3a7b1c2d-4e5f-4a6b-8c9d-0e1f2a3b4c5d');
  const firstPost = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const secondPost = PostId.parse('11111111-2222-4333-8444-555555555555');

  const author = new AuthorView({ id: authorId, name: 'manuel', email: 'manuel@example.com' });

  /** O que o handler devolve é a entidade; aqui só interessa que o mapper a receba. */
  const aPost = (postId: PostId) => ({ postId }) as unknown as Post;

  const aView = (postId: PostId) =>
    new PostView({
      id: postId.value,
      title: 'um post',
      content: 'conteúdo',
      authorId: authorId.value,
      createdAt: new Date('2026-09-08T12:00:00.000Z'),
      updatedAt: new Date('2026-09-08T12:00:00.000Z'),
      version: 1,
      tags: [],
    });

  /** O `Cursor` do MikroORM, no mínimo que o `connectionOf` usa dele. */
  const aPage = (overrides: Partial<Record<string, unknown>> = {}) => ({
    items: [aPost(firstPost), aPost(secondPost)],
    from: (post: Post) => `cursor:${(post as any).postId.value}`,
    hasNextPage: true,
    hasPrevPage: false,
    startCursor: 'inicio',
    endCursor: 'fim',
    totalCount: 42,
    ...overrides,
  });

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    const view = vi.spyOn(mapper, 'fromPost').mockImplementation((post) => aView((post as any).postId));
    return { resolver: new AuthorPostsResolver(bus, mapper), dispatched, view };
  };

  afterEach(() => vi.restoreAllMocks());

  it('despacha FindPostsByAuthor com o id do autor do parent', async () => {
    const { resolver, dispatched } = resolverOn(aPage());

    await resolver.posts(author, 2, 'cursor-anterior');

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(FindPostsByAuthorQuery.FindPostsByAuthor);
    const query = dispatched[0] as FindPostsByAuthorQuery.FindPostsByAuthor;
    expect(query.authorId.equals(authorId)).toBe(true);
    expect(query).toMatchObject({ first: 2, after: 'cursor-anterior' });
  });

  /** Quem preenche o tamanho padrão é a **mensagem**, não a borda — como em `Query.posts`. */
  it('repassa first e after como vieram, e o default de página é da mensagem', async () => {
    const { resolver, dispatched } = resolverOn(aPage());

    await resolver.posts(author);

    expect(dispatched[0]).toMatchObject({ first: 20, after: undefined });
  });

  it('monta as edges com o cursor de cada linha e a view de cada post', async () => {
    const { resolver, view } = resolverOn(aPage());

    const connection = await resolver.posts(author, 2);

    expect(connection.edges).toHaveLength(2);
    expect(connection.edges.map((edge) => edge.cursor)).toEqual([
      `cursor:${firstPost.value}`,
      `cursor:${secondPost.value}`,
    ]);
    expect(connection.edges[0].node.id.equals(firstPost)).toBe(true);
    expect(view).toHaveBeenCalledTimes(2);
  });

  /** O ponto: os flags são **do ORM**. Um `hasNextPage` recalculado aqui seria uma paginação que mente. */
  it('o pageInfo vem do Cursor, e não de uma conta refeita', async () => {
    const { resolver } = resolverOn(aPage({ hasNextPage: false, hasPrevPage: true, totalCount: 2 }));

    const connection = await resolver.posts(author, 2);

    expect(connection.pageInfo).toEqual({
      hasNextPage: false,
      hasPreviousPage: true,
      startCursor: 'inicio',
      endCursor: 'fim',
    });
    expect(connection.totalCount).toBe(2);
  });

  it('um autor sem posts é uma página vazia, não um erro', async () => {
    const { resolver, view } = resolverOn(
      aPage({ items: [], hasNextPage: false, startCursor: null, endCursor: null, totalCount: 0 }),
    );

    const connection = await resolver.posts(author);

    expect(connection.edges).toEqual([]);
    expect(connection.pageInfo).toMatchObject({ hasNextPage: false, startCursor: null, endCursor: null });
    expect(connection.totalCount).toBe(0);
    expect(view).not.toHaveBeenCalled();
  });
});
