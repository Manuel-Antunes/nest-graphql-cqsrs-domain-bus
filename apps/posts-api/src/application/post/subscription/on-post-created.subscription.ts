import type { ISubscriptionHandler } from '@nestposts/cqsrs';
import type { Observable } from 'rxjs';
import { EventBus, ofType } from '@nestjs/cqrs';
import { Subscription, SubscriptionHandler } from '@nestposts/cqsrs';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';

export namespace OnPostCreatedSubscription {
  export class OnPostCreated extends Subscription<PostCreatedEvent> {}

  @SubscriptionHandler(OnPostCreated)
  export class Handler implements ISubscriptionHandler<OnPostCreated> {
    constructor(private readonly eventBus: EventBus) {}

    subscribe(): Observable<PostCreatedEvent> {
      return this.eventBus.pipe(ofType(PostCreatedEvent));
    }
  }
}
