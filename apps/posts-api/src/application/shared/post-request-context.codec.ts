import { Injectable } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { CorrelatedRequestContext, type Ingestion } from '@nestposts/transport-eventbus';
import { POST_ID_ATTRIBUTE, PostRequest } from './post-request';

@Injectable()
export class PostRequestContextCodec extends CorrelatedRequestContext {
  protected override contextFor(message: Ingestion): AsyncContext | undefined {
    const postId = message.metadata[POST_ID_ATTRIBUTE];
    return postId ? new PostRequest(PostId.parse(postId)) : undefined;
  }
}
