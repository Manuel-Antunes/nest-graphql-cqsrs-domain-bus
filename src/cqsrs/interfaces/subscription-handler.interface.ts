import type { Observable } from 'rxjs';
import type { Subscription } from '../classes/subscription';
import type { ISubscription } from './subscription.interface';

/**
 * O contrato de um handler de subscription — o irmão do `IQueryHandler`, com a única diferença que
 * importa: **`subscribe` devolve um `Observable`, não uma `Promise`**.
 *
 * Um handler de subscription não *responde*: ele **liga** a mensagem a uma fonte de eventos (na
 * prática, o `EventBus` filtrado por `ofType(...)`) e devolve esse stream. Ele não precisa aplicar o
 * critério do assinante — disso cuida o `SubscriptionBus`, chamando `subscription.filter(event)`.
 *
 * Quando a mensagem estende `Subscription<TEvent>`, o tipo do evento é inferido dela e o
 * `Observable<TEvent>` de volta é conferido pelo compilador.
 */
export type ISubscriptionHandler<T extends ISubscription = any, TEvent = any> =
  T extends Subscription<infer InferredEvent, any>
    ? {
        /**
         * Abre o stream desta subscription.
         * @param subscription A subscription pedida (com o critério de quem pediu).
         */
        subscribe(subscription: T): Observable<InferredEvent>;
      }
    : {
        /**
         * Abre o stream desta subscription.
         * @param subscription A subscription pedida (com o critério de quem pediu).
         */
        subscribe(subscription: T): Observable<TEvent>;
      };
