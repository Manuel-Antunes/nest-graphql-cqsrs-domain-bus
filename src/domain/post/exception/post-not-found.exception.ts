/** O command apontou para um Post que não existe — o equivalente do `EntityNotFoundException` do Axon. */
import type { PostId } from '../vo/post-id';

export class PostNotFoundException extends Error {
  constructor(readonly postId: PostId) {
    super(`post ${postId} não existe`);
    this.name = 'PostNotFoundException';
  }
}
