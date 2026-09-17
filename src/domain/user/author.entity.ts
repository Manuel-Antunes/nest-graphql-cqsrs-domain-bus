import { Collection, PrimaryKeyProp, ref, type Ref } from "@mikro-orm/core";
import type { Post } from "../post/post.entity";
import { BaseEntity } from "../shared/base-entity";
import { Delegate } from "../shared/delegation/delegate";
import { User } from "./user.entity";
import type { UserId } from "./vo/user-id";

export const AUTHOR_ROLE = "author";

export interface AuthorPostsPage {
  readonly limit: number;
  readonly offset?: number;
}

export interface IAuthor {
  posted(page: AuthorPostsPage): Promise<Post[]>;
  postCount(): Promise<number>;
  wrote(post: Post): boolean;
}

export class Authorship
  extends BaseEntity<{ user: Ref<User> }>
  implements IAuthor
{
  [PrimaryKeyProp]?: "user";

  user!: Ref<User>;

  readonly posts = new Collection<Post, Authorship>(this);

  static of(user: User): Authorship {
    return new Authorship({ user: ref(user) });
  }

  get id(): UserId {
    return this.user.id;
  }

  posted(page: AuthorPostsPage): Promise<Post[]> {
    return this.posts.matching({
      limit: page.limit,
      offset: page.offset ?? 0,
      orderBy: { createdAt: "desc", id: "desc" },
    });
  }

  postCount(): Promise<number> {
    return this.posts.loadCount();
  }

  wrote(post: Post): boolean {
    return post.author.id.equals(this.id);
  }
}

export const Author = Delegate(User, {
  name: "Author",
  to: Authorship,
  as: "authorship",
  from: "user",
  forwarding: ["posted", "postCount", "wrote"],
});

export type Author = InstanceType<typeof Author>;
