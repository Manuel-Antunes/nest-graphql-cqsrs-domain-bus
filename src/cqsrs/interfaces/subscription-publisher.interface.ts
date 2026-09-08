import type { ISubscription } from './subscription.interface';

/**
 * Para onde o `SubscriptionBus` anuncia cada subscription pedida — o espelho do `IQueryPublisher`.
 * O padrão (`DefaultSubscriptionPubSub`) empurra para o `Subject` do próprio bus, que é o que torna
 * o `SubscriptionBus` um `Observable` de "alguém se inscreveu em quê".
 */
export interface ISubscriptionPublisher<SubscriptionBase extends ISubscription = ISubscription> {
  publish<T extends SubscriptionBase = SubscriptionBase>(subscription: T): any;
}
