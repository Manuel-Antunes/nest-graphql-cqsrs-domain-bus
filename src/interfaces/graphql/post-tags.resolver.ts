import { Cursor } from '@mikro-orm/core';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import type { TagConnection } from '../../dto/graphql/post.connection';
import { PostView } from '../../dto/graphql/post.view';

/**
 * O campo `Post.tags(first, after)`: uma cursor connection sobre a lista de tags que **já veio** com o
 * post (é uma coluna JSON da própria linha), recortada em memória.
 *
 * Não há DataLoader aqui porque não há N+1 a evitar: N posts numa resposta são N linhas, e as tags
 * estão dentro delas. Se um dia `tags` virar uma relação de verdade, a resposta nativa é o
 * `dataloader: DataloaderType.ALL` do MikroORM, que junta os `load()` de uma mesma rodada numa
 * consulta só — a fronteira deste resolver não mudaria.
 *
 * Os cursores usam o mesmo codec do `Cursor` do MikroORM que a connection de `posts` usa
 * (`Cursor.encode`/`Cursor.decode`): base64 do valor de ordenação — aqui, a posição absoluta da tag.
 */
/**
 * **Lacuna conhecida:** na versão Axon toda operação exige autenticação — o `leitor@example.com`
 * existe justamente para demonstrar acesso só de leitura. Aqui as leituras estão abertas porque a
 * sessão ainda não é propagada pela conexão WebSocket das subscriptions, e deixar metade autenticada
 * seria pior que assumir a dívida por escrito. As escritas já exigem sessão e papel.
 */
@AllowAnonymous()
@Resolver('Post')
export class PostTagsResolver {
  @ResolveField('tags')
  tags(
    @Parent() post: PostView,
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): TagConnection {
    const limit = Math.min(Math.max(first ?? FindAllPostsQuery.DEFAULT_PAGE_SIZE, 1), FindAllPostsQuery.MAX_PAGE_SIZE);
    const start = after ? Number(Cursor.decode(after)[0]) + 1 : 0;
    const edges = post.tags
      .slice(start, start + limit)
      .map((tag, offset) => ({ cursor: Cursor.encode([start + offset]), node: tag }));
    return {
      edges,
      pageInfo: {
        hasNextPage: start + limit < post.tags.length,
        hasPreviousPage: start > 0,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
      totalCount: post.tags.length,
    };
  }
}
