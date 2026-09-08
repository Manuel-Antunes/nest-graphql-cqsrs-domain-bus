import { EventBus, type IQueryHandler, ofType, QueryHandler } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
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
 * Como o `QueryBus.execute` faz `await handler.execute(query)` e um `Observable` não é *thenable*,
 * o resultado chega inteiro do outro lado — sem ser assinado.
 */
@QueryHandler(OnPostCreatedSubscription)
export class OnPostCreatedSubscriptionHandler implements IQueryHandler<OnPostCreatedSubscription> {
  constructor(private readonly eventBus: EventBus) {}

  async execute(): Promise<Observable<PostCreatedEvent>> {
    return this.eventBus.pipe(ofType(PostCreatedEvent));
  }
}
