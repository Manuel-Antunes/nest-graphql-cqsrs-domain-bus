import type { Cursor } from '@mikro-orm/core';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Args, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { FindPostsByAuthorQuery } from '../../application/post/query/find-posts-by-author.query';
import { Post } from '../../domain/post/post.entity';
import { PostView } from '../../dto/graphql/post.view';
import type { AuthorView } from '../../dto/graphql/user.view';
import { ConnectionInterceptor } from '../interceptors/connection.interceptor';

/**
 * O campo `Author.posts(first, after)`: uma cursor connection sobre os posts de quem o `me` devolveu.
 *
 * É o gêmeo do {@link PostTagsResolver} com o sinal trocado, e a comparação é o que explica os dois.
 * Lá as tags **já vinham** com o post (são uma relação pequena e limitada, populada no repositório), e
 * o resolver só recorta em memória. Aqui não há lista para recortar: um autor produtivo acumula
 * milhares de posts, e a página precisa ser uma consulta com `limit` — a mesma razão pela qual a
 * coleção `Author.posts` do domínio nasce não inicializada e nenhum método a carrega inteira.
 *
 * ## O N+1 que este campo tem, desde que `Post.author` virou um `Author`
 * Enquanto o único caminho até um `Author` era o `me`, havia **um** por requisição e não existia lote a
 * agrupar. `Post.author` abriu o outro caminho, e com ele o caso que a versão Axon resolve por
 * DataLoader: `posts(first: 20) { author { posts { … } } }` chega aqui vinte vezes, e cada vez é a sua
 * própria consulta paginada.
 *
 * A dívida é real e está assumida por escrito, não escondida: a POC não tem volume para senti-la, e a
 * saída não muda a fronteira desta classe. Ela é o `dataloader: DataloaderType.ALL` (já ligado no
 * config) passando a valer para este campo — o que exige pedir a página pela **relação** do agregado
 * (`Author.posts`, que o dataloader do MikroORM agrupa) em vez de uma consulta por autor. O que hoje
 * impede isso é o `populate`: ver `PostRepository.findByAuthor`.
 *
 * Repare no que **não** é N+1: `posts(first: 20) { author { … } }`, sem descer para os posts do autor.
 * Esse é de graça, porque o repositório já populou o autor de cada post — ver `PostAuthorResolver`.
 *
 * ## O que ele faz com os cursores: nada
 * O método devolve o `Cursor` que o `em.findByCursor` produziu, e o {@link ConnectionInterceptor} —
 * o mesmo de `Query.posts` — monta a connection a partir dele. É por isso que as duas connections por
 * cursor não podem divergir.
 */
@Resolver('Author')
export class AuthorPostsResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveField('posts')
  @UseInterceptors(ConnectionInterceptor(Post, PostView))
  async posts(
    @Parent() author: AuthorView,
    @Args('first') first?: number | null,
    @Args('after') after?: string | null,
  ): Promise<Cursor<Post>> {
    return this.queryBus.execute(
      new FindPostsByAuthorQuery.FindPostsByAuthor(author.id, first, after),
    );
  }
}
