import { type Cursor, EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Post } from '../../../domain/post/post.entity';
import { type PostPage, PostRepository } from '../../../domain/post/post.repository';
import type { PostId } from '../../../domain/post/vo/post-id';

/**
 * Adapter da porta `PostRepository` sobre o MikroORM. Três métodos, nenhuma regra de negócio.
 *
 * O `EntityManager` injetado é o global: cada método dele delega para o contexto atual — o fork da
 * request HTTP, ou o fork que `@CreateRequestContext()` abriu para o command. É isso que faz o
 * `flush` de `save` gravar exatamente o que **aquele** command mudou, e nada mais.
 */
@Injectable()
export class MikroOrmPostRepository extends PostRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(post: Post): Promise<void> {
    await this.em.persist(post).flush();
  }

  findById(postId: PostId): Promise<Post | null> {
    return this.em.findOne(Post, { id: postId });
  }

  /**
   * Paginação por cursor nativa do ORM: `first`/`after` viram um `WHERE (created_at, id) > (?, ?)` +
   * `LIMIT first + 1`, e o `Cursor` devolvido já sabe se há próxima página e qual é o `endCursor`.
   * A ordenação é `createdAt, id` — `createdAt` sozinho não é único.
   */
  findAll(page: PostPage): Promise<Cursor<Post>> {
    return this.em.findByCursor(Post, {
      first: page.first,
      after: page.after ?? undefined,
      orderBy: { createdAt: 'asc', id: 'asc' },
    });
  }
}
