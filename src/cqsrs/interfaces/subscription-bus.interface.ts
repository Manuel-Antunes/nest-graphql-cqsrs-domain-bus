import type { Observable } from 'rxjs';
import type { AsyncContext } from '@nestjs/cqrs';
import type { Subscription } from '../classes/subscription';
import type { ISubscription } from './subscription.interface';

/**
 * O contrato do bus de subscriptions. `subscribe` está para ele como `execute` está para o
 * `QueryBus`: acha o handler da mensagem e devolve o resultado — que aqui é um stream, vivo até
 * quem se inscreveu cancelar.
 */
export interface ISubscriptionBus<SubscriptionBase extends ISubscription = ISubscription> {
  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   */
  subscribe<TEvent>(subscription: Subscription<TEvent, any>): Observable<TEvent>;
  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   */
  subscribe<T extends SubscriptionBase, TEvent = any>(subscription: T): Observable<TEvent>;
  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   * @param asyncContext O contexto de um handler request-scoped.
   */
  subscribe<TEvent>(subscription: Subscription<TEvent, any>, asyncContext: AsyncContext): Observable<TEvent>;
  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   * @param asyncContext O contexto de um handler request-scoped.
   */
  subscribe<T extends SubscriptionBase, TEvent = any>(subscription: T, asyncContext: AsyncContext): Observable<TEvent>;
}
