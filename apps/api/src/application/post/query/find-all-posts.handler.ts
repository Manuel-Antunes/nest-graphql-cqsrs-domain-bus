import { type Cursor, EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Post } from '../../../domain/post/post.entity';
import { PostRepository } from '../../../domain/post/post.repository';
import { FindAllPostsQuery } from './find-all-posts.query';

/**
 * Handler de `FindAllPostsQuery`. A mecânica do `hasNextPage` (a linha a mais que nunca vaza para o
 * resultado) é do `em.findByCursor` do MikroORM, não deste código.
 */
@QueryHandler(FindAllPostsQuery)
export class FindAllPostsQueryHandler implements IQueryHandler<FindAllPostsQuery> {
  constructor(
    private readonly em: EntityManager,
    private readonly posts: PostRepository,
  ) {}

  @EnsureRequestContext()
  async execute(query: FindAllPostsQuery): Promise<Cursor<Post>> {
    return this.posts.findAll({ first: query.first, after: query.after });
  }
}
