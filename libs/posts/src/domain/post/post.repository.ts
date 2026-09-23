import type { Cursor } from '@mikro-orm/core';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { Post } from './post.entity';
import type { PostId } from './vo/post-id';

export interface PostPage {
  readonly first: number;
  readonly after?: string | null;
}

export abstract class PostRepository {
  abstract save(post: Post): Promise<void>;
  abstract findById(postId: PostId): Promise<Post | null>;
  abstract findAll(page: PostPage): Promise<Cursor<Post>>;

  abstract findByAuthor(
    authorId: UserId,
    page: PostPage,
  ): Promise<Cursor<Post>>;

  abstract restore(postId: PostId): Promise<void>;
}
