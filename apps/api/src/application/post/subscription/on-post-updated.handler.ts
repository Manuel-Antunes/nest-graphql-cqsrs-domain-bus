import { EventBus, ofType } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { type ISubscriptionHandler, SubscriptionHandler } from '@app/cqsrs';
import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';
import { OnPostUpdatedSubscription } from './on-post-updated.subscription';

/**
 * Handler de `OnPostUpdatedSubscription`: o `EventBus` filtrado pelos `PostUpdatedEvent`.
 *
 * Repare no que ele **não** faz: nada de `postId`. O handler responde por "de onde vêm os eventos
 * desta subscription"; o recorte por assinante é o `filter` da própria mensagem, aplicado pelo bus.
 */
@SubscriptionHandler(OnPostUpdatedSubscription)
export class OnPostUpdatedSubscriptionHandler implements ISubscriptionHandler<OnPostUpdatedSubscription> {
  constructor(private readonly eventBus: EventBus) {}

  subscribe(): Observable<PostUpdatedEvent> {
    return this.eventBus.pipe(ofType(PostUpdatedEvent));
  }
}
