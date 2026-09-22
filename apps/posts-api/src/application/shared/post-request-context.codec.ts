import { Injectable } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';
import { Tenant } from '@nestposts/database';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { CorrelatedRequestContext, type Ingestion } from '@nestposts/transport-eventbus';
import { POST_ID_ATTRIBUTE, PostRequest, TENANT_ATTRIBUTE } from './post-request';

@Injectable()
export class PostRequestContextCodec extends CorrelatedRequestContext {
  protected override contextFor(message: Ingestion): AsyncContext | undefined {
    const postId = message.metadata[POST_ID_ATTRIBUTE];
    return postId
      ? new PostRequest(
          PostId.parse(postId),
          Tenant.normalize(message.metadata[TENANT_ATTRIBUTE]),
        )
      : undefined;
  }
}
