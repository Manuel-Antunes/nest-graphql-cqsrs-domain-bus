import type { Observable } from 'rxjs';
import { EventBus, ofType } from '@nestjs/cqrs';
import {
  type ISubscriptionHandler,
  Subscription,
  SubscriptionHandler,
} from '@nestposts/cqsrs';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';

export namespace OnPostUpdatedSubscription {
  export interface Criteria {
    readonly postId?: string | null;
  }

  export class OnPostUpdated extends Subscription<PostUpdatedEvent, Criteria> {
    override match(event: PostUpdatedEvent): boolean {
      return !this.criteria.postId || event.postId === this.criteria.postId;
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
