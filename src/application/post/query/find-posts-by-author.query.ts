import { type Cursor } from '@mikro-orm/core';
import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import type { Post } from '../../../domain/post/post.entity';
import { PostRepository } from '../../../domain/post/post.repository';
import type { UserId } from '../../../domain/user/vo/user-id';
import { FindAllPostsQuery } from './find-all-posts.query';

/**
 * A fatia de `FindPostsByAuthor`: a mensagem e o handler que servem o campo `Author.posts`.
 *
 * ## Por que o campo passa por uma query, e não chama o agregado
 * O resolver tem em mãos uma `AuthorView`, e a borda fala com a aplicação **pelos buses** — é a regra
 * que o `ApplicationModule` declara, e a que impede um resolver de alcançar um repositório. A
 * alternativa seria a view carregar o `Author` de domínio para o resolver paginar nele; aí a borda
 * passaria a manipular um agregado, e o DTO a transportar um.
 *
 * ## Os limites são os mesmos de `posts`
 * `DEFAULT_PAGE_SIZE` e `MAX_PAGE_SIZE` vêm de {@link FindAllPostsQuery} em vez de serem redeclarados:
 * são duas páginas da mesma coisa, e um teto diferente em cada uma seria uma diferença que ninguém
 * decidiu. É a mesma reutilização que o `PostTagsResolver` já faz.
 */
export namespace FindPostsByAuthorQuery {
  /**
   * Query: uma página dos posts de um autor, do mais recente para o mais antigo. Como em
   * `FindAllPosts`, o cursor é opaco para quem pede — quem o codifica e decodifica é o MikroORM.
   */
  export class FindPostsByAuthor extends Query<Cursor<Post>> {
    readonly first: number;

    constructor(
      readonly authorId: UserId,
      first: number | null | undefined,
      readonly after?: string | null,
    ) {
      super();
      this.first = Math.min(
        Math.max(first ?? FindAllPostsQuery.DEFAULT_PAGE_SIZE, 1),
        FindAllPostsQuery.MAX_PAGE_SIZE,
      );
    }
  }

  /**
   * Handler de `FindPostsByAuthor`.
   *
   * Não checa se o autor existe, e é de propósito: o recorte é por chave estrangeira, então um id que
   * não seja de autor devolve uma página vazia em vez de um erro. Quem garante que há um autor ali é o
   * caminho por onde se chega a este campo — um `... on Author` só casa com quem o `__resolveType`
   * reconheceu —, e transformar a ausência em exceção daria ao cliente um oráculo de quais ids
   * existem, que é o mesmo defeito que o `NotAnAuthorException` sem id descreve.
   */
  @QueryHandler(FindPostsByAuthor)
  export class Handler implements IQueryHandler<FindPostsByAuthor> {
    constructor(private readonly posts: PostRepository) {}

    async execute(query: FindPostsByAuthor): Promise<Cursor<Post>> {
      return this.posts.findByAuthor(query.authorId, { first: query.first, after: query.after });
    }
  }
}
