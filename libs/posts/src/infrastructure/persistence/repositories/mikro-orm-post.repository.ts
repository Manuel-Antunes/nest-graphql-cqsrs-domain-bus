import { type Cursor, EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Post } from '../../../domain/post/post.entity';
import { type PostPage, PostRepository } from '../../../domain/post/post.repository';
import type { PostId } from '../../../domain/post/vo/post-id';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { inRequestContext } from '@nestposts/database';
import { ACTIVE_FILTER } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete-orm.entity';

@Injectable()
export class MikroOrmPostRepository extends PostRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(post: Post): Promise<void> {
    await this.em.persist(post).flush();
  }

  findById(postId: PostId): Promise<Post | null> {
    return this.em.findOne(Post, { id: postId }, { populate: ['tags', 'author'] });
  }

  async restore(postId: PostId): Promise<void> {
    await this.em.nativeUpdate(
      Post,
      { id: postId },
      { deleted: { deletedAt: null } },
      { filters: { [ACTIVE_FILTER]: false } },
    );
  }

  findAll(page: PostPage): Promise<Cursor<Post>> {
    return this.em.findByCursor(Post, {
      first: page.first,
      after: page.after ?? undefined,
      orderBy: { createdAt: 'asc', id: 'asc' },
      populate: ['tags', 'author'],
    });
  }

  findByAuthor(authorId: UserId, page: PostPage): Promise<Cursor<Post>> {
    return inRequestContext(this.em, () =>
      this.em.findByCursor(Post, {
        where: { author: authorId },
        first: page.first,
        after: page.after ?? undefined,
        orderBy: { createdAt: 'desc', id: 'desc' },
        populate: ['tags', 'author'],
      }),
    );
  }
}
