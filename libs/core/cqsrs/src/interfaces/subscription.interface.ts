/**
 * Marker for a subscription message — the equivalent of @nestjs/cqrs's `IQuery`/`ICommand`. Empty on
 * purpose: whoever wants the type guarantees extends the `Subscription<TEvent>` class.
 */
// biome-ignore lint/suspicious/noEmptyInterface: a marker interface, and an interface carries no implicit index signature
export interface ISubscription {}
