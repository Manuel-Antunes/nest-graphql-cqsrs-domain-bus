/**
 * Phantom property carrying a `Subscription`'s event type — the same trick as the
 * `RESULT_TYPE_SYMBOL` that @nestjs/cqrs's `Query<T>` uses for its result type. It does not exist at
 * runtime: its only job is to let `SubscriptionBus.subscribe(sub)` infer `Observable<TEvent>`.
 */
export const EVENT_TYPE_SYMBOL = Symbol('EVENT_TYPE');
