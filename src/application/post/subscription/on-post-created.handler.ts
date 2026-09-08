import { EventBus, ofType } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { type ISubscriptionHandler, SubscriptionHandler } from '../../../cqsrs';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';
import { OnPostCreatedSubscription } from './on-post-created.subscription';

/**
 * Handler de `OnPostCreatedSubscription`: devolve o `EventBus` filtrado pelos `PostCreatedEvent`.
 *
 * O `EventBus` do @nestjs/cqrs **é** um `Observable` (`ObservableBus` estende `Observable`, com um
 * `Subject` por baixo) — o mesmo objeto em que os event handlers e as sagas se inscrevem. `ofType`
 * é o operador que o próprio pacote exporta para as sagas. Nenhum emitter novo, nenhum PubSub: a
 * subscription GraphQL ouve o mesmo stream que o resto da aplicação.
 *
 * O handler devolve o `Observable` e acaba aqui: quem aplica o critério do assinante, compartilha o
 * stream entre assinantes iguais e desliga tudo quando o último sai é o `SubscriptionBus`.
 */
@SubscriptionHandler(OnPostCreatedSubscription)
export class OnPostCreatedSubscriptionHandler implements ISubscriptionHandler<OnPostCreatedSubscription> {
  constructor(private readonly eventBus: EventBus) {}

  subscribe(): Observable<PostCreatedEvent> {
    return this.eventBus.pipe(ofType(PostCreatedEvent));
  }
}
