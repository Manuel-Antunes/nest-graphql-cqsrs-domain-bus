import type { Mapper } from '@automapper/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import type { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostView } from '../../dto/graphql/post.view';
import type { ConnectionType, Page } from '../../dto/graphql/connection';
import { ConnectionInterceptor } from './connection.interceptor';

describe('ConnectionInterceptor', () => {
  const id = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const otherId = PostId.parse('11111111-2222-4333-8444-555555555555');

  const aPost = (postId: PostId) => ({ postId }) as unknown as Post;
  const aView = (post: Post) => ({ id: (post as any).postId }) as unknown as PostView;

  const aPage = (overrides: Partial<Record<string, unknown>> = {}) =>
    ({
      items: [aPost(id), aPost(otherId)],
      from: (post: Post) => `cursor:${(post as any).postId.value}`,
      hasNextPage: true,
      hasPrevPage: false,
      startCursor: 'inicio',
      endCursor: 'fim',
      totalCount: 42,
      ...overrides,
    }) as unknown as Page<Post>;

  const mapperSpy = () => {
    const calls: Post[][] = [];
    const mapper = {
      mapArrayAsync: (items: Post[]) => {
        calls.push(items);
        return Promise.resolve(items.map(aView));
      },
    } as unknown as Mapper;
    return { mapper, calls };
  };

  const intercept = async (page: Page<Post>) => {
    const { mapper, calls } = mapperSpy();
    const Interceptor = ConnectionInterceptor({} as never, {} as never) as unknown as new (
      mapper: Mapper,
    ) => { intercept: (c: ExecutionContext, n: CallHandler) => any };
    const next: CallHandler = { handle: () => of(page) };
    const connection: ConnectionType<PostView> = await lastValueFrom(
      new Interceptor(mapper).intercept({} as ExecutionContext, next),
    );
    return { connection, calls };
  };

  it('dá a cada edge o cursor que o ORM deu para aquele item', async () => {
    const { connection } = await intercept(aPage());

    expect(connection.edges.map((edge) => edge.cursor)).toEqual([
      `cursor:${id.value}`,
      `cursor:${otherId.value}`,
    ]);
  });

  it('casa cada nó com o item que o originou', async () => {
    const { connection } = await intercept(aPage());

    expect(connection.edges.map((edge) => (edge.node as any).id)).toEqual([id, otherId]);
  });

  it('traduz a página inteira numa passada, e não uma vez por edge', async () => {
    const { calls } = await intercept(aPage());

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);
  });

  it('o pageInfo é o que o ORM calculou, sem conta refeita aqui', async () => {
    const { connection } = await intercept(aPage({ hasNextPage: false, hasPrevPage: true }));

    expect(connection.pageInfo).toEqual({
      hasNextPage: false,
      hasPreviousPage: true,
      startCursor: 'inicio',
      endCursor: 'fim',
    });
    expect(connection.totalCount).toBe(42);
  });

  it('uma página vazia é uma connection vazia, não um erro', async () => {
    const { connection } = await intercept(
      aPage({ items: [], hasNextPage: false, startCursor: null, endCursor: null, totalCount: 0 }),
    );

    expect(connection.edges).toEqual([]);
    expect(connection.totalCount).toBe(0);
    expect(connection.pageInfo).toMatchObject({
      hasNextPage: false,
      startCursor: null,
      endCursor: null,
    });
  });

  describe('sem o par de modelos: envelope só, nó como veio', () => {
    const envelope = async (page: Page<Post>) => {
      const Interceptor = ConnectionInterceptor() as unknown as new (mapper: Mapper) => {
        intercept: (c: ExecutionContext, n: CallHandler) => any;
      };
      const { mapper } = mapperSpy();
      const next: CallHandler = { handle: () => of(page) };
      return (await lastValueFrom(
        new Interceptor(mapper).intercept({} as ExecutionContext, next),
      )) as ConnectionType<Post>;
    };

    it('entrega os nós como vieram, sem tocá-los', async () => {
      const page = aPage();

      const connection = await envelope(page);

      expect(connection.edges.map((edge) => edge.node)).toEqual(page.items);
      expect(connection.edges[0].node).toBe(page.items[0]);
    });

    it('monta o mesmo envelope que a chamada com modelos', async () => {
      const connection = await envelope(aPage({ hasNextPage: false, hasPrevPage: true }));

      expect(connection.edges.map((edge) => edge.cursor)).toEqual([
        `cursor:${id.value}`,
        `cursor:${otherId.value}`,
      ]);
      expect(connection.pageInfo).toEqual({
        hasNextPage: false,
        hasPreviousPage: true,
        startCursor: 'inicio',
        endCursor: 'fim',
      });
      expect(connection.totalCount).toBe(42);
    });
  });
});
