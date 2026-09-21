/**
 * Marker for a subscription message — the equivalent of @nestjs/cqrs's `IQuery`/`ICommand`. Empty on
 * purpose: whoever wants the type guarantees extends the `Subscription<TEvent>` class.
 */
export interface ISubscription {}
