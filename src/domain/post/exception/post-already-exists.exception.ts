/** Um `CreatePostCommand.CreatePost` chegou com um id que já tem Post. */
import type { PostId } from '../vo/post-id';

export class PostAlreadyExistsException extends Error {
  constructor(readonly postId: PostId) {
    super(`post ${postId} já existe`);
    this.name = 'PostAlreadyExistsException';
  }
}
