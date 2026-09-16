import type { PostId } from '../vo/post-id';

export class PostNotFoundException extends Error {
  constructor(readonly postId: PostId) {
    super(`post ${postId} não existe`);
    this.name = 'PostNotFoundException';
  }
}
