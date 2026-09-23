import type { Observable } from 'rxjs';

import type { Subscription } from '../classes/subscription';
import type { ISubscription } from './subscription.interface';

/**
 * A subscription handler's contract — sibling to `IQueryHandler`, with the one difference that
 * matters: **`subscribe` returns an `Observable`, not a `Promise`**.
 *
 * A subscription handler does not *answer*: it **wires** the message to an event source (in practice,
 * the `EventBus` filtered by `ofType(...)`) and returns that stream. It does not need to apply the
 * subscriber's criteria — the `SubscriptionBus` takes care of that, calling `subscription.match(event)`.
 *
 * When the message extends `Subscription<TEvent>`, the event type is inferred from it and the returned
 * `Observable<TEvent>` is checked by the compiler.
 */
export type ISubscriptionHandler<T extends ISubscription = any, TEvent = any> =
  T extends Subscription<infer InferredEvent, any>
    ? {
        /**
         * Opens this subscription's stream.
         * @param subscription The requested subscription (carrying the requester's criteria).
         */
        subscribe(subscription: T): Observable<InferredEvent>;
      }
    : {
        /**
         * Opens this subscription's stream.
         * @param subscription The requested subscription (carrying the requester's criteria).
         */
        subscribe(subscription: T): Observable<TEvent>;
      };
