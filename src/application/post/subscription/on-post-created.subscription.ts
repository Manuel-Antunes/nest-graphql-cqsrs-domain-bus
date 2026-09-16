import { EventBus, ofType } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { type ISubscriptionHandler, Subscription, SubscriptionHandler } from '../../../cqsrs';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';

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
