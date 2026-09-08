import { EventBus, type IQueryHandler, ofType, QueryHandler } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';
import { OnPostUpdatedSubscription } from './on-post-updated.subscription';

/** Handler de `OnPostUpdatedSubscription`: o `EventBus` filtrado pelos `PostUpdatedEvent`. */
@QueryHandler(OnPostUpdatedSubscription)
export class OnPostUpdatedSubscriptionHandler implements IQueryHandler<OnPostUpdatedSubscription> {
  constructor(private readonly eventBus: EventBus) {}

  async execute(): Promise<Observable<PostUpdatedEvent>> {
    return this.eventBus.pipe(ofType(PostUpdatedEvent));
  }
}
