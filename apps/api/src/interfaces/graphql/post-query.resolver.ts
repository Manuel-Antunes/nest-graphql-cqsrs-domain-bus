import { QueryBus } from '@nestjs/cqrs';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostId } from '../../domain/post/vo/post-id';
import { PostConnection } from '../../dto/graphql/post.connection';
import { PostView } from '../../dto/graphql/post.view';
import { PostViewMapper } from '../../mapper/post-view.mapper';

/**
 * Camada de interface das **queries** GraphQL: traduz argumentos em queries do `QueryBus` e o
 * resultado em views. A cursor connection de `posts` é montada a partir do `Cursor` do MikroORM: os
 * cursores de cada edge vêm de `page.from(post)`, o `pageInfo` dos flags que o ORM já calculou.
 */
@Resolver(() => PostView)
export class PostQueryResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly viewMapper: PostViewMapper,
  ) {}

  @Query(() => PostView, { name: 'post', nullable: true, description: 'Um Post pelo id; null se não existir' })
  async post(@Args('id', { type: () => ID }) id: string): Promise<PostView | null> {
    const post = await this.queryBus.execute(new FindPostQuery(PostId.parse(id)));
    return post && this.viewMapper.fromPost(post);
  }

  @Query(() => PostConnection, {
    name: 'posts',
    description: 'Posts em ordem de criação, como Relay cursor connection (só para frente: first/after)',
  })
  async posts(
    @Args('first', { type: () => Int, nullable: true, description: 'Quantos posts trazer; ausente = 20' })
    first?: number | null,
    @Args('after', { type: () => String, nullable: true, description: 'Cursor do último post já visto' })
    after?: string | null,
  ): Promise<PostConnection> {
    const page = await this.queryBus.execute(new FindAllPostsQuery(first, after));
    return {
      edges: page.items.map((post) => ({ cursor: page.from(post), node: this.viewMapper.fromPost(post) })),
      pageInfo: {
        hasNextPage: page.hasNextPage,
        hasPreviousPage: page.hasPrevPage,
        startCursor: page.startCursor,
        endCursor: page.endCursor,
      },
      totalCount: page.totalCount,
    };
  }
}
