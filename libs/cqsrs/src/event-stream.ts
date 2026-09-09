import { Injectable } from '@nestjs/common';
import { EventBus, type IEvent } from '@nestjs/cqrs';
import { merge, Observable } from 'rxjs';
import { RemoteEventBus } from './remote-event-bus';

/**
 * **Tudo o que vale ouvir**: os eventos publicados aqui (`EventBus`) e os que chegaram de outro
 * serviço (`RemoteEventBus`), num `Observable` só. É a fonte dos `@SubscriptionHandler`.
 *
 * A assimetria com o `EventBus` é o ponto:
 *
 * | | quem alimenta | quem escuta |
 * |---|---|---|
 * | `EventBus` | só o processo local | sagas, `@EventsHandler`, e o `EventStream` |
 * | `RemoteEventBus` | só os outros processos | o `EventStream` |
 * | **`EventStream`** | **os dois** | **os `@SubscriptionHandler`** |
 *
 * Quem se inscreve numa subscription GraphQL quer ver *o fluxo inteiro* — inclusive os passos que
 * rodaram no outro serviço. Quem reage com um command quer agir *uma vez só*, no dono do fato. Duas
 * necessidades diferentes, dois streams; a subscription não precisa saber de onde o evento veio, e a
 * saga não corre o risco de reagir ao que não é dela.
 *
 * Num processo só — sem transporte nenhum ligado ao `RemoteEventBus` — o `EventStream` é exatamente o
 * `EventBus`, e não custa nada: um `merge` com um `Subject` que ninguém alimenta.
 *
 * ```ts
 * @SubscriptionHandler(OnOrderUpdatedSubscription)
 * export class OnOrderUpdatedSubscriptionHandler implements ISubscriptionHandler<OnOrderUpdatedSubscription> {
 *   constructor(private readonly events: EventStream) {}
 *   subscribe(): Observable<OrderEvent> {
 *     return this.events.pipe(filter((event): event is OrderEvent => event instanceof OrderEvent));
 *   }
 * }
 * ```
 */
@Injectable()
export class EventStream extends Observable<IEvent> {
  constructor(eventBus: EventBus, remoteEventBus: RemoteEventBus) {
    super();
    this.source = merge(eventBus, remoteEventBus);
  }
}
