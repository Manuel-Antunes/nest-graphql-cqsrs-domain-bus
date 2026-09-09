import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Post } from '../../../domain/post/post.entity';
import { PostRepository } from '../../../domain/post/post.repository';
import { FindPostQuery } from './find-post.query';

/**
 * Handler de `FindPostQuery`. Devolve a própria entidade: quem achata os value objects para o
 * protocolo é o `PostViewMapper`, na borda.
 *
 * `@EnsureRequestContext()`: leituras rodam no contexto da request HTTP quando há um (o middleware
 * do `@mikro-orm/nestjs` cria um por request) e criam o seu quando não há — num teste, ou numa
 * query disparada de dentro de uma conexão WebSocket.
 */
@QueryHandler(FindPostQuery)
export class FindPostQueryHandler implements IQueryHandler<FindPostQuery> {
  constructor(
    private readonly em: EntityManager,
    private readonly posts: PostRepository,
  ) {}

  @EnsureRequestContext()
  async execute(query: FindPostQuery): Promise<Post | null> {
    return this.posts.findById(query.postId);
  }
}
