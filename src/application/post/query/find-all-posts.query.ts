import type { Cursor } from '@mikro-orm/core';
import { Query } from '@nestjs/cqrs';
import type { Post } from '../../../domain/post/post.entity';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Query: uma página de Posts em ordem de criação, no estilo Relay (`first` depois de `after`).
 * O cursor é opaco para quem pede: é o MikroORM quem o codifica e decodifica.
 */
export class FindAllPostsQuery extends Query<Cursor<Post>> {
  readonly first: number;

  constructor(
    first: number | null | undefined,
    readonly after?: string | null,
  ) {
    super();
    this.first = Math.min(Math.max(first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  }
}
