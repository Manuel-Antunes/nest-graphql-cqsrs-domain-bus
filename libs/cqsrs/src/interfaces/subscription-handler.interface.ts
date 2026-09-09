import type { Observable } from 'rxjs';
import type { ISubscription } from './subscription.interface';

/**
 * O contrato de um handler de subscription — o irmão do `IQueryHandler`, com a única diferença que
 * importa: **`subscribe` devolve um `Observable`, não uma `Promise`**.
 *
 * Um handler de subscription não *responde*: ele **liga** a mensagem a uma fonte de eventos (na
 * prática, o `EventBus` ou o `EventStream` filtrado por `ofType(...)`) e devolve esse stream. Ele
 * não precisa aplicar o critério do assinante — disso cuida o `SubscriptionBus`, chamando
 * `subscription.filter(event)`.
 *
 * O tipo do evento sai da própria mensagem (do parâmetro do `filter` dela), então o `Observable` de
 * volta é conferido pelo compilador sem que o handler precise repeti-lo.
 */
export type ISubscriptionHandler<T extends ISubscription = ISubscription, TEvent = any> =
  T extends ISubscription<infer InferredEvent>
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
