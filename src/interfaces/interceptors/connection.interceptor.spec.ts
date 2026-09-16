import type { Mapper } from '@automapper/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { PostView } from '../../dto/graphql/post.view';
import type { ConnectionType, Page } from '../../dto/graphql/connection';
import { ConnectionInterceptor } from './connection.interceptor';

/**
 * A montagem da cursor connection, isolada do mapeamento dos nós.
 *
 * Estes testes estavam no `PostQueryResolver` e vieram para cá junto com o comportamento. Como o mesmo
 * interceptor serve `Query.posts` e `Author.posts`, o que se afirma aqui vale para as duas de uma vez
 * — que é a razão de ele existir.
 *
 * O ponto delicado continua o mesmo: **nenhum flag de `pageInfo` é calculado aqui**. `hasPreviousPage`
 * vem do `hasPrevPage` do ORM, e não de uma conta local com o `after`; são nomes diferentes para a
 * mesma coisa, e o mapeamento entre eles é exatamente o que pode quebrar. Um `hasNextPage` inventado
 * seria uma paginação que mente.
 */
describe('ConnectionInterceptor', () => {
  const id = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const otherId = PostId.parse('11111111-2222-4333-8444-555555555555');

  /** O que o handler devolve é a entidade; aqui só interessa que o mapper a receba em ordem. */
  const aPost = (postId: PostId) => ({ postId }) as unknown as Post;
  const aView = (post: Post) => ({ id: (post as any).postId }) as unknown as PostView;

  /** O `Cursor` do MikroORM, no mínimo que o interceptor usa dele. */
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

  /**
   * Um mapper que traduz a lista inteira de uma vez — é o contrato que o interceptor usa, e o teste
   * conta as chamadas para prender que ele não vira uma tradução por edge.
   */
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
    // Arrange / Act
    const { connection } = await intercept(aPage());

    // Assert
    expect(connection.edges.map((edge) => edge.cursor)).toEqual([
      `cursor:${id.value}`,
      `cursor:${otherId.value}`,
    ]);
  });

  /** O nó de cada edge é o que o mapper produziu para **aquele** item, na ordem da página. */
  it('casa cada nó com o item que o originou', async () => {
    // Arrange / Act
    const { connection } = await intercept(aPage());

    // Assert
    expect(connection.edges.map((edge) => (edge.node as any).id)).toEqual([id, otherId]);
  });

  it('traduz a página inteira numa passada, e não uma vez por edge', async () => {
    // Arrange / Act
    const { calls } = await intercept(aPage());

    // Assert
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(2);
  });

  it('o pageInfo é o que o ORM calculou, sem conta refeita aqui', async () => {
    // Arrange / Act
    const { connection } = await intercept(aPage({ hasNextPage: false, hasPrevPage: true }));

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
    // Arrange / Act
    const { connection } = await intercept(
      aPage({ items: [], hasNextPage: false, startCursor: null, endCursor: null, totalCount: 0 }),
    );

    // Assert
    expect(connection.edges).toEqual([]);
    expect(connection.totalCount).toBe(0);
    expect(connection.pageInfo).toMatchObject({
      hasNextPage: false,
      startCursor: null,
      endCursor: null,
    });
  });

  /**
   * A chamada **sem o par de modelos**, que serve o `Post.tags`: a página já chega com os nós prontos
   * (as tags foram traduzidas lá atrás, no `Post → PostView`), então só o envelope é montado.
   *
   * É o mesmo interceptor, e o envelope é o mesmo — é o ponto da sobrecarga: o que muda entre os dois
   * usos é se os nós passam pelo mapper, e nada mais. O teste abaixo confere justamente isso, campo a
   * campo, contra o resultado da outra chamada.
   */
  describe('sem o par de modelos: envelope só, nó como veio', () => {
    const envelope = async (page: Page<Post>) => {
      // Sem o par de modelos: a mesma fábrica, o mesmo formato de chamada.
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
      // Arrange
      const page = aPage();

      // Act
      const connection = await envelope(page);

      // Assert
      expect(connection.edges.map((edge) => edge.node)).toEqual(page.items);
      expect(connection.edges[0].node).toBe(page.items[0]);
    });

    it('monta o mesmo envelope que a chamada com modelos', async () => {
      // Arrange / Act
      const connection = await envelope(aPage({ hasNextPage: false, hasPrevPage: true }));

      // Assert
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
