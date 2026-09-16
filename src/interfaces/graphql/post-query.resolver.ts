import { MapInterceptor } from '@automapper/nestjs';
import type { Cursor } from '@mikro-orm/core';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { PostView } from '../../dto/graphql/post.view';
import { ConnectionInterceptor } from '../interceptors/connection.interceptor';

/**
 * Camada de interface das **queries** GraphQL: traduz argumentos em queries do `QueryBus`, e mais
 * nada — o que volta do bus é o agregado, e quem o transforma em view é o interceptor.
 *
 * `posts` usa o `ConnectionInterceptor` do projeto, e não o da lib: é o mesmo de `Author.posts`,
 * para que as duas connections por cursor não possam divergir.
 *
 * ## O que o decorator diz, agora
 * `@Query('posts')` nomeia **o campo do schema** — não um tipo de retorno. O que `posts` devolve está
 * escrito no `type Query` de `src/graphql/post-query.graphql`, e é de lá que o Nest o lê; o tipo no
 * TypeScript é só o que o compilador confere, e ele diz o que o método tem na mão (`Cursor<Post>`), não
 * o que o cliente recebe. Se o nome aqui não existir no schema, o Apollo recusa na subida.
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
  constructor(private readonly queryBus: QueryBus) {}

  /**
   * `async` e não um `return` direto: o `PostId.parse` recusa um id malformado **antes** de virar
   * mensagem, e essa recusa precisa chegar como promessa rejeitada, e não como throw síncrono.
   */
  @Query('post')
  @UseInterceptors(MapInterceptor(Post, PostView))
  async post(@Args('id') id: string): Promise<Post | null> {
    return this.queryBus.execute(new FindPostQuery.FindPost(PostId.parse(id)));
  }

  @Query('posts')
  @UseInterceptors(ConnectionInterceptor(Post, PostView))
  async posts(
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Promise<Cursor<Post>> {
    return this.queryBus.execute(new FindAllPostsQuery.FindAllPosts(first, after));
  }
}
