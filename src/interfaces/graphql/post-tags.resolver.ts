import { UseInterceptors } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { pageOf, type Page } from '../../dto/graphql/connection';
import { PostView } from '../../dto/graphql/post.view';
import { TagView } from '../../dto/graphql/tag.view';
import { ConnectionInterceptor } from '../interceptors/connection.interceptor';

/**
 * O campo `Post.tags(first, after)`: uma cursor connection sobre a lista de tags que **já veio** com o
 * post, recortada em memória.
 *
 * Não há DataLoader aqui porque não há N+1 a evitar: as tags de cada post são populadas junto com ele,
 * e recortar uma lista já carregada não consulta nada.
 *
 * ## O que este resolver faz, e o que ele parou de fazer
 * Ele decide **o recorte** — o tamanho da página, clampado pelos mesmos limites de `Query.posts`, e
 * onde ela começa. Montar o envelope (edges, cursores, `pageInfo`) já não é dele: ele devolve a
 * {@link Page}, e o {@link ConnectionInterceptor} faz o resto, com o mesmo `connectionOf` que serve
 * `Query.posts` e `Author.posts`. Eram três lugares montando connection; passou a ser um.
 *
 * ## Sem tradução de nó, e por quê
 * O `ConnectionInterceptor()` vai **sem o par de modelos**: `post.tags` já é `TagView[]` — quem
 * traduziu foi o mapeamento `Post → PostView`, lá atrás. Mapear de novo aqui seria traduzir o que já
 * está traduzido.
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
  @UseInterceptors(ConnectionInterceptor())
  tags(
    @Parent() post: PostView,
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Page<TagView> {
    const limit = Math.min(
      Math.max(first ?? FindAllPostsQuery.DEFAULT_PAGE_SIZE, 1),
      FindAllPostsQuery.MAX_PAGE_SIZE,
    );
    return pageOf(post.tags, limit, after);
  }
}
