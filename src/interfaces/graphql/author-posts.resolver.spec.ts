import type { QueryBus } from '@nestjs/cqrs';
import { FindPostsByAuthorQuery } from '../../application/post/query/find-posts-by-author.query';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorView } from '../../dto/graphql/user.view';
import { AuthorPostsResolver } from './author-posts.resolver';

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
    const { resolver, dispatched } = resolverOn({ items: [] });

    await resolver.posts(author, 2, 'cursor-anterior');

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(FindPostsByAuthorQuery.FindPostsByAuthor);
    const query = dispatched[0] as FindPostsByAuthorQuery.FindPostsByAuthor;
    expect(query.authorId.equals(authorId)).toBe(true);
    expect(query).toMatchObject({ first: 2, after: 'cursor-anterior' });
  });

  it('repassa first e after como vieram, e o default de página é da mensagem', async () => {
    const { resolver, dispatched } = resolverOn({ items: [] });

    await resolver.posts(author);

    expect(dispatched[0]).toMatchObject({ first: 20, after: undefined });
  });

  it('devolve o Cursor do ORM, sem montar connection nenhuma', async () => {
    const page = { items: [aPost(firstPost)] };
    const { resolver } = resolverOn(page);

    const result = await resolver.posts(author, 2);

    expect(result).toBe(page);
  });
});
