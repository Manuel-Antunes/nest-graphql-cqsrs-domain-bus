import { EventStream, type ISubscriptionHandler, SubscriptionHandler } from '@app/cqsrs';
import { filter, type Observable } from 'rxjs';
import { OrderEvent } from '../../domain/event/order-event';
import { OnOrderUpdatedSubscription } from './on-order-updated.subscription';

/**
 * O handler de `OnOrderUpdatedSubscription` — e o lugar onde o sistema distribuído fica invisível.
 *
 * Ele escuta o `EventStream`, não o `EventBus`. A diferença é tudo: dos quatro passos do fluxo, dois
 * acontecem neste serviço (`OrderStarted`, `OrderCompleted`) e dois no de pagamentos
 * (`PaymentAuthorized`, `PaymentCaptured`) — e o assinante precisa dos quatro, na ordem. O
 * `EventStream` é o local mais o remoto; o `EventBus` seria só metade da história.
 *
 * ## A ordem que ele entrega
 * Os passos chegam por dois transportes — os do outro serviço por Redis, os daqui pelo `EventBus`
 * local depois de uma ida e volta pelo RabbitMQ —, e dois transportes independentes não têm ordem
 * entre si. Dois passos publicados quase no mesmo instante, um em cada serviço, podem chegar
 * trocados. A ordem **causal** está no `occurredAt` de cada evento; é por ele que um cliente ordena
 * a linha do tempo.
 *
 * `instanceof OrderEvent` em vez de `ofType(...)` com os seis tipos: a base comum é o que
 * significa "um passo do fluxo do pedido", e um sétimo passo entra sem tocar aqui. Vale notar que
 * isso só funciona porque o que chega do Redis é **reconstruído como instância da classe** — um
 * objeto solto de `JSON.parse` não passaria no `instanceof`.
 */
@SubscriptionHandler(OnOrderUpdatedSubscription)
export class OnOrderUpdatedSubscriptionHandler implements ISubscriptionHandler<OnOrderUpdatedSubscription> {
  constructor(private readonly events: EventStream) {}

  subscribe(): Observable<OrderEvent> {
    return this.events.pipe(filter((event): event is OrderEvent => event instanceof OrderEvent));
  }
}
