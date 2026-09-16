import { Collection } from '@mikro-orm/core';
import type { Post } from '../post/post.entity';
import { User } from './user.entity';

export interface AuthorPostsPage {
  readonly limit: number;
  readonly offset?: number;
}

export class Author extends User {
  readonly posts = new Collection<Post, Author>(this);

  override canWritePosts(): this is Author {
    return true;
  }

  posted(page: AuthorPostsPage): Promise<Post[]> {
    return this.posts.matching({
      limit: page.limit,
      offset: page.offset ?? 0,
      orderBy: { createdAt: 'desc', id: 'desc' },
    });
  }

  postCount(): Promise<number> {
    return this.posts.loadCount();
  }

  wrote(post: Post): boolean {
    return post.author.id.equals(this.id);
  }
}
