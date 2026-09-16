import type { UserId } from '../../user/vo/user-id';
import type { PostId } from '../vo/post-id';

export class PostNotWrittenByException extends Error {
  constructor(
    readonly postId: PostId,
    readonly userId: UserId,
  ) {
    super(`post ${postId} não foi escrito por ${userId}`);
    this.name = 'PostNotWrittenByException';
  }
}
