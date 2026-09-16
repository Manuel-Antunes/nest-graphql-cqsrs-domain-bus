import type { QueryBus } from '@nestjs/cqrs';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { PostQueryResolver } from './post-query.resolver';

describe('PostQueryResolver', () => {
  const id = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');

  const aPost = (postId = id) => ({ postId }) as unknown as Post;

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new PostQueryResolver(bus), dispatched };
  };

  describe('post(id)', () => {
    it('traduz o id do protocolo em FindPost com o value object', async () => {
      const { resolver, dispatched } = resolverOn(aPost());

      await resolver.post(id.value);

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]).toBeInstanceOf(FindPostQuery.FindPost);
      expect((dispatched[0] as FindPostQuery.FindPost).postId.equals(id)).toBe(true);
    });

    it('devolve o agregado que o handler achou, sem tocá-lo', async () => {
      const post = aPost();
      const { resolver } = resolverOn(post);

      const result = await resolver.post(id.value);

      expect(result).toBe(post);
    });

    it('um post que não existe vira null', async () => {
      const { resolver } = resolverOn(null);

      const result = await resolver.post(id.value);

      expect(result).toBeNull();
    });

    it('um id que não é UUID é recusado antes de virar mensagem', async () => {
      const { resolver, dispatched } = resolverOn(aPost());

      await expect(resolver.post('nem-uuid')).rejects.toThrow();
      expect(dispatched).toEqual([]);
    });
  });

  describe('posts(first, after)', () => {
    it('repassa first e after como vieram, e o default de página é da mensagem', async () => {
      const { resolver, dispatched } = resolverOn({ items: [] });

      await resolver.posts(2, 'cursor-anterior');
      await resolver.posts();

      expect(dispatched[0]).toBeInstanceOf(FindAllPostsQuery.FindAllPosts);
      expect(dispatched[0]).toMatchObject({ first: 2, after: 'cursor-anterior' });
      expect(dispatched[1]).toMatchObject({ first: 20, after: undefined });
    });

    it('devolve o Cursor do ORM, sem montar connection nenhuma', async () => {
      const page = { items: [aPost()] };
      const { resolver } = resolverOn(page);

      const result = await resolver.posts();

      expect(result).toBe(page);
    });
  });
});
