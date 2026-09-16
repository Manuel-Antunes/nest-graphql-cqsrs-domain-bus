import { AsyncContext } from '@nestjs/cqrs';
import type { PostId } from '../../domain/post/vo/post-id';

export class PostRequest extends AsyncContext {
  constructor(readonly postId: PostId) {
    super();
  }

  static override of(message: object): PostRequest | undefined {
    const context = AsyncContext.of(message);
    return context instanceof PostRequest ? context : undefined;
  }
}
