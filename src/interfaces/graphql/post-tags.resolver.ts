import { Cursor } from '@mikro-orm/core';
import { Args, Int, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { TagConnection } from '../../dto/graphql/post.connection';
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
@Resolver(() => PostView)
export class PostTagsResolver {
  @ResolveField(() => TagConnection, { name: 'tags', description: 'Tags do post, como Relay cursor connection' })
  tags(
    @Parent() post: PostView,
    @Args('first', { type: () => Int, nullable: true, description: 'Quantas tags trazer; ausente = 20' })
    first?: number | null,
    @Args('after', { type: () => String, nullable: true, description: 'Cursor da última tag já vista' })
    after?: string | null,
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
