import { EventBus, ofType } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { type ISubscriptionHandler, Subscription, SubscriptionHandler } from '../../../cqsrs';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';

/** A fatia de `OnPostCreated`: a mensagem e o handler dela — ver `CreatePostCommand` para o padrão. */
export namespace OnPostCreatedSubscription {
  /**
   * Subscription: "me avise quando um Post for criado" — todos, sem critério.
   *
   * No Axon isso era uma *subscription query* — uma query cujo resultado é um `Flux`. Aqui é a terceira
   * mensagem do CQSRS: uma `Subscription` cujo handler não consulta o banco, ele **liga o stream ao
   * `EventBus`**. É por isso que ela mora em `application/post/subscription`, e não na camada de
   * interface: decidir quais eventos alimentam qual subscription é regra da aplicação; a interface só
   * converte o stream para o transporte.
   *
   * Sem critério, `TCriteria` fica `void`: `new OnPostCreatedSubscription.OnPostCreated()`, e o
   * `filter` herdado passa tudo.
   */
  export class OnPostCreated extends Subscription<PostCreatedEvent> {}

  /**
   * Handler de `OnPostCreated`: devolve o `EventBus` filtrado pelos `PostCreatedEvent`.
   *
   * O `EventBus` do @nestjs/cqrs **é** um `Observable` (`ObservableBus` estende `Observable`, com um
   * `Subject` por baixo) — o mesmo objeto em que os event handlers e as sagas se inscrevem. `ofType`
   * é o operador que o próprio pacote exporta para as sagas. Nenhum emitter novo, nenhum PubSub: a
   * subscription GraphQL ouve o mesmo stream que o resto da aplicação.
   *
   * O handler devolve o `Observable` e acaba aqui: quem aplica o critério do assinante, compartilha o
   * stream entre assinantes iguais e desliga tudo quando o último sai é o `SubscriptionBus`.
   */
  @SubscriptionHandler(OnPostCreated)
  export class Handler implements ISubscriptionHandler<OnPostCreated> {
    constructor(private readonly eventBus: EventBus) {}

    subscribe(): Observable<PostCreatedEvent> {
      return this.eventBus.pipe(ofType(PostCreatedEvent));
    }
  }
}
