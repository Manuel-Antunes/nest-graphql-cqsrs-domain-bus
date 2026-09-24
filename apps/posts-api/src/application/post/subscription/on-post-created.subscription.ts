import { EventBus, ofType } from '@nestjs/cqrs';
import type { ISubscriptionHandler } from '@nestposts/cqsrs';
import { Subscription, SubscriptionHandler } from '@nestposts/cqsrs';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import type { Observable } from 'rxjs';

import { PostRequest } from '../../shared/post-request';

export namespace OnPostCreatedSubscription {
  export interface Criteria {
    readonly tenantId: string;
  }

  export class OnPostCreated extends Subscription<PostCreatedEvent, Criteria> {
    override match(event: PostCreatedEvent): boolean {
      return PostRequest.tenantOf(event) === this.criteria.tenantId;
    }
  }

  @SubscriptionHandler(OnPostCreated)
  export class Handler implements ISubscriptionHandler<OnPostCreated> {
    constructor(private readonly eventBus: EventBus) {}

    subscribe(): Observable<PostCreatedEvent> {
      return this.eventBus.pipe(ofType(PostCreatedEvent));
    }
  }
}
