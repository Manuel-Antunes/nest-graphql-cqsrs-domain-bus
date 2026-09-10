import { QueryBus } from '@nestjs/cqrs';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostId } from '../../domain/post/vo/post-id';
import { connectionOf } from '../../dto/graphql/connection';
import type { PostConnection } from '../../dto/graphql/post.connection';
import { PostView } from '../../dto/graphql/post.view';
import { PostViewMapper } from '../mapper/post-view.mapper';

/**
 * Camada de interface das **queries** GraphQL: traduz argumentos em queries do `QueryBus` e o
 * resultado em views. A cursor connection de `posts` é montada a partir do `Cursor` do MikroORM pelo
 * `connectionOf`: os cursores de cada edge vêm de `page.from(post)`, o `pageInfo` dos flags que o ORM
 * já calculou — e o mesmo helper serve `Author.posts`, para que as duas connections por cursor não
 * possam divergir.
 *
 * ## O que o decorator diz, agora
 * `@Query('posts')` nomeia **o campo do schema** — não um tipo de retorno. O que `posts` devolve está
 * escrito no `type Query` de `src/graphql/post-query.graphql`, e é de lá que o Nest o lê; o `PostConnection` no
 * TypeScript é só o tipo que o compilador confere. Se o nome aqui não existir no schema, o Apollo
 * recusa na subida.
 */
/**
 * **Lacuna conhecida:** na versão Axon toda operação exige autenticação — o `leitor@example.com`
 * existe justamente para demonstrar acesso só de leitura. Aqui as leituras estão abertas porque a
 * sessão ainda não é propagada pela conexão WebSocket das subscriptions, e deixar metade autenticada
 * seria pior que assumir a dívida por escrito. As escritas já exigem sessão e papel.
 */
@AllowAnonymous()
@Resolver('Post')
export class PostQueryResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly viewMapper: PostViewMapper,
  ) {}

  @Query('post')
  async post(@Args('id') id: string): Promise<PostView | null> {
    const post = await this.queryBus.execute(new FindPostQuery.FindPost(PostId.parse(id)));
    return post && this.viewMapper.fromPost(post);
  }

  @Query('posts')
  async posts(
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Promise<PostConnection> {
    const page = await this.queryBus.execute(new FindAllPostsQuery.FindAllPosts(first, after));
    return connectionOf(page, (post) => this.viewMapper.fromPost(post));
  }
}
