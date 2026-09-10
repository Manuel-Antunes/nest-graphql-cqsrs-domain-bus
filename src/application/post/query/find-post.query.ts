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
   * Não é request-scoped, e é de propósito: uma leitura não abre cadeia causal nenhuma, então não há
   * identidade a propagar. O contexto de que ela precisa é o do ORM, e esse já vem aberto da borda —
   * o middleware que o `MikroOrmModule.forRoot` registra. Nos testes quem o abre é o
   * `inRequestContext` do fixture.
   */
  @QueryHandler(FindPost)
  export class Handler implements IQueryHandler<FindPost> {
    constructor(
      private readonly posts: PostRepository,
    ) {}
    async execute(query: FindPost): Promise<Post | null> {
      return this.posts.findById(query.postId);
    }
  }
}
