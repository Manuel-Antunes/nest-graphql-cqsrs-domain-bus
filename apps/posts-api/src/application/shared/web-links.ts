import { DEFAULT_WEB_URL } from '@nestposts/auth/infrastructure/better-auth/config';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';

export class WebLinks {
  constructor(readonly baseUrl: string) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): WebLinks {
    return new WebLinks(env.WEB_URL ?? DEFAULT_WEB_URL);
  }

  post(postId: PostId): string {
    return new URL(`/posts/${postId.value}`, this.baseUrl).toString();
  }
}
