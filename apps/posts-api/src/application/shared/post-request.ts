import { AsyncContext } from '@nestjs/cqrs';
import type { ContextAttributes } from '@nestposts/transport-eventbus';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';

export const POST_ID_ATTRIBUTE = 'post-request-post-id';

export class PostRequest extends AsyncContext implements ContextAttributes {
  constructor(readonly postId: PostId) {
    super();
  }

  static override of(message: object): PostRequest | undefined {
    const context = AsyncContext.of(message);
    return context instanceof PostRequest ? context : undefined;
  }

  toAttributes(): Record<string, string> {
    return { [POST_ID_ATTRIBUTE]: this.postId.value };
  }
}
