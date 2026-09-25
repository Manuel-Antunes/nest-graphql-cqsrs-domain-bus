import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';

export class WebLinks {
  constructor(readonly baseUrl: string) {}

  post(postId: PostId): string {
    return new URL(`/posts/${postId.value}`, this.baseUrl).toString();
  }
}
