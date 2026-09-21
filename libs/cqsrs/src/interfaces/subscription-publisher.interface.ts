import type { ISubscription } from './subscription.interface';

/**
 * Where the `SubscriptionBus` announces every requested subscription — the mirror of `IQueryPublisher`.
 * The default (`DefaultSubscriptionPubSub`) pushes into the bus's own `Subject`, which is what turns
 * the `SubscriptionBus` into an `Observable` of "who subscribed to what".
 */
export interface ISubscriptionPublisher<SubscriptionBase extends ISubscription = ISubscription> {
  publish<T extends SubscriptionBase = SubscriptionBase>(subscription: T): any;
}
