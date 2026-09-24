import type { AsyncContext } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';

import type { Subscription } from '../classes/subscription';
import type { ISubscription } from './subscription.interface';

/**
 * The subscription bus contract. `subscribe` is to it what `execute` is to the `QueryBus`: it finds
 * the message's handler and returns the result — which here is a stream, alive until whoever
 * subscribed cancels.
 */
export interface ISubscriptionBus<
  SubscriptionBase extends ISubscription = ISubscription,
> {
  /**
   * Opens (or reuses) a subscription's stream.
   * @param subscription The subscription, carrying the requester's criteria.
   */
  subscribe<TEvent>(
    subscription: Subscription<TEvent, any>,
  ): Observable<TEvent>;
  /**
   * Opens (or reuses) a subscription's stream.
   * @param subscription The subscription, carrying the requester's criteria.
   */
  subscribe<T extends SubscriptionBase, TEvent = any>(
    subscription: T,
  ): Observable<TEvent>;
  /**
   * Opens (or reuses) a subscription's stream.
   * @param subscription The subscription, carrying the requester's criteria.
   * @param asyncContext A request-scoped handler's context.
   */
  subscribe<TEvent>(
    subscription: Subscription<TEvent, any>,
    asyncContext: AsyncContext,
  ): Observable<TEvent>;
  /**
   * Opens (or reuses) a subscription's stream.
   * @param subscription The subscription, carrying the requester's criteria.
   * @param asyncContext A request-scoped handler's context.
   */
  subscribe<T extends SubscriptionBase, TEvent = any>(
    subscription: T,
    asyncContext: AsyncContext,
  ): Observable<TEvent>;
}
