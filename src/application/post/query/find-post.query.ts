import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import type { Post } from '../../../domain/post/post.entity';
import { PostRepository } from '../../../domain/post/post.repository';
import type { PostId } from '../../../domain/post/vo/post-id';

/** A fatia de `FindPost`: a mensagem e o handler dela — ver `CreatePostCommand` para o padrão. */
export namespace FindPostQuery {
  /** Query: um Post pelo id; `null` se não existir. */
  export class FindPost extends Query<Post | null> {
    constructor(readonly postId: PostId) {
      super();
    }
  }

  /**
   * Handler de `FindPost`. Devolve a própria entidade: quem achata os value objects para o protocolo
   * é o `PostViewMapper`, na borda.
   *
   * `@EnsureRequestContext()`: leituras rodam no contexto da request HTTP quando há um (o middleware
   * do `@mikro-orm/nestjs` cria um por request) e criam o seu quando não há — num teste, ou numa
   * query disparada de dentro de uma conexão WebSocket.
   *
   * Não é request-scoped, e é de propósito: uma leitura não abre cadeia causal nenhuma, então não há
   * identidade a propagar — o único contexto de que ela precisa é o do ORM.
   */
  @QueryHandler(FindPost)
  export class Handler implements IQueryHandler<FindPost> {
    constructor(
      private readonly em: EntityManager,
      private readonly posts: PostRepository,
    ) {}

    @EnsureRequestContext()
    async execute(query: FindPost): Promise<Post | null> {
      return this.posts.findById(query.postId);
    }
  }
}
