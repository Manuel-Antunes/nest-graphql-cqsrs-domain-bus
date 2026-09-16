import type { QueryBus } from '@nestjs/cqrs';
import { FindPostsByAuthorQuery } from '../../application/post/query/find-posts-by-author.query';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorView } from '../../dto/graphql/user.view';
import { AuthorPostsResolver } from './author-posts.resolver';

/**
 * `Author.posts`, isolado: nem banco nem GraphQL.
 *
 * O que sobrou deste resolver é **um** sentido de tradução — a `AuthorView` do parent → uma
 * `FindPostsByAuthor` com o value object do id — e é só isso que se afirma aqui. A connection saiu:
 * ela é do `ConnectionInterceptor`, que é o **mesmo** de `Query.posts`.
 *
 * Vale reparar no que essa mudança fez com os testes. Antes, os flags de `pageInfo` eram afirmados
 * duas vezes — uma aqui, outra no `PostQueryResolver` — porque o código que os montava estava nos
 * dois lugares; e as duas cópias podiam divergir sem que teste nenhum reclamasse, porque cada uma
 * tinha a sua. Agora há um teste só, no interceptor, e ele vale para as duas connections porque é ele
 * que as duas usam.
 */
describe('AuthorPostsResolver', () => {
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const firstPost = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');

  const author = new AuthorView({
    id: authorId.value,
    name: 'manuel',
    email: 'manuel@example.com',
  });

  const aPost = (postId: PostId) => ({ postId }) as unknown as Post;

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new AuthorPostsResolver(bus), dispatched };
  };

  it('despacha FindPostsByAuthor com o id do autor do parent', async () => {
    // Arrange
    const { resolver, dispatched } = resolverOn({ items: [] });

    // Act
    await resolver.posts(author, 2, 'cursor-anterior');

    // Assert
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(FindPostsByAuthorQuery.FindPostsByAuthor);
    const query = dispatched[0] as FindPostsByAuthorQuery.FindPostsByAuthor;
    expect(query.authorId.equals(authorId)).toBe(true);
    expect(query).toMatchObject({ first: 2, after: 'cursor-anterior' });
  });

  /** Quem preenche o tamanho padrão é a **mensagem**, não a borda — como em `Query.posts`. */
  it('repassa first e after como vieram, e o default de página é da mensagem', async () => {
    // Arrange
    const { resolver, dispatched } = resolverOn({ items: [] });

    // Act
    await resolver.posts(author);

    // Assert
    expect(dispatched[0]).toMatchObject({ first: 20, after: undefined });
  });

  /** A página sai daqui como o ORM a produziu — quem a envelopa é o `ConnectionInterceptor`. */
  it('devolve o Cursor do ORM, sem montar connection nenhuma', async () => {
    // Arrange
    const page = { items: [aPost(firstPost)] };
    const { resolver } = resolverOn(page);

    // Act
    const result = await resolver.posts(author, 2);

    // Assert
    expect(result).toBe(page);
  });
});
