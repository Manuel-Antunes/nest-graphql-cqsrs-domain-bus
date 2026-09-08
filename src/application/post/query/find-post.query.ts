import { Query } from '@nestjs/cqrs';
import type { Post } from '../../../domain/post/post.entity';
import type { PostId } from '../../../domain/post/vo/post-id';

/** Query: um Post pelo id; `null` se não existir. */
export class FindPostQuery extends Query<Post | null> {
  constructor(readonly postId: PostId) {
    super();
  }
}
