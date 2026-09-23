import { AsyncContext } from '@nestjs/cqrs';
import { ROOT_TENANT, TENANT_HEADER } from '@nestposts/database';
import type { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import type { ContextAttributes } from '@nestposts/transport-eventbus';

export const POST_ID_ATTRIBUTE = 'post-request-post-id';

export const TENANT_ATTRIBUTE = TENANT_HEADER;

export class PostRequest extends AsyncContext implements ContextAttributes {
  constructor(
    readonly postId: PostId,
    readonly tenantId: string = ROOT_TENANT,
  ) {
    super();
  }

  static override of(message: object): PostRequest | undefined {
    const context = AsyncContext.of(message);
    return context instanceof PostRequest ? context : undefined;
  }

  toAttributes(): Record<string, string> {
    return {
      [POST_ID_ATTRIBUTE]: this.postId.value,
      [TENANT_ATTRIBUTE]: this.tenantId,
    };
  }
}
