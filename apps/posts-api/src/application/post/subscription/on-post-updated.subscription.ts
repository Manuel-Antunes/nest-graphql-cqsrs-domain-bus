import { EventBus, ofType } from '@nestjs/cqrs';
import type { ISubscriptionHandler } from '@nestposts/cqsrs';
import { Subscription, SubscriptionHandler } from '@nestposts/cqsrs';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import type { Observable } from 'rxjs';

import { PostRequest } from '../../shared/post-request';

export namespace OnPostUpdatedSubscription {
  export interface Criteria {
    readonly tenantId: string;
    readonly postId?: string | null;
  }

  export class OnPostUpdated extends Subscription<PostUpdatedEvent, Criteria> {
    override match(event: PostUpdatedEvent): boolean {
      return (
        PostRequest.tenantOf(event) === this.criteria.tenantId &&
        (!this.criteria.postId || event.postId === this.criteria.postId)
      );
    }
  }

  @SubscriptionHandler(OnPostUpdated)
  export class Handler implements ISubscriptionHandler<OnPostUpdated> {
    constructor(private readonly eventBus: EventBus) {}

    subscribe(): Observable<PostUpdatedEvent> {
      return this.eventBus.pipe(ofType(PostUpdatedEvent));
    }
  }
}
