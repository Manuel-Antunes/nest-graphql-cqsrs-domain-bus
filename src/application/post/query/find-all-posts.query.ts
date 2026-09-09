import { type Cursor, EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import type { Post } from '../../../domain/post/post.entity';
import { PostRepository } from '../../../domain/post/post.repository';

/** A fatia de `FindAllPosts`: a mensagem, o handler e os limites de paginação que os dois usam. */
export namespace FindAllPostsQuery {
  export const DEFAULT_PAGE_SIZE = 20;
  export const MAX_PAGE_SIZE = 100;

  /**
   * Query: uma página de Posts em ordem de criação, no estilo Relay (`first` depois de `after`).
   * O cursor é opaco para quem pede: é o MikroORM quem o codifica e decodifica.
   */
  export class FindAllPosts extends Query<Cursor<Post>> {
    readonly first: number;

    constructor(
      first: number | null | undefined,
      readonly after?: string | null,
    ) {
      super();
      this.first = Math.min(Math.max(first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    }
  }

  /**
   * Handler de `FindAllPosts`. A mecânica do `hasNextPage` (a linha a mais que nunca vaza para o
   * resultado) é do `em.findByCursor` do MikroORM, não deste código.
   */
  @QueryHandler(FindAllPosts)
  export class Handler implements IQueryHandler<FindAllPosts> {
    constructor(
      private readonly em: EntityManager,
      private readonly posts: PostRepository,
    ) {}

    @EnsureRequestContext()
    async execute(query: FindAllPosts): Promise<Cursor<Post>> {
      return this.posts.findAll({ first: query.first, after: query.after });
    }
  }
}
