import type { Subject } from 'rxjs';

import type { ISubscription } from '../interfaces/subscription.interface';
import type { ISubscriptionPublisher } from '../interfaces/subscription-publisher.interface';

/**
 * The default publisher: pushes every requested subscription into the `SubscriptionBus`'s own
 * `Subject` — which turns the bus into an `Observable` of "who subscribed to what". The mirror of
 * @nestjs/cqrs's `DefaultQueryPubSub`; swappable through the module's `subscriptionPublisher` option.
 */
export class DefaultSubscriptionPubSub<SubscriptionBase extends ISubscription>
  implements ISubscriptionPublisher<SubscriptionBase>
{
  constructor(private readonly subject$: Subject<SubscriptionBase>) {}

  publish<T extends SubscriptionBase = SubscriptionBase>(
    subscription: T,
  ): void {
    this.subject$.next(subscription);
  }
}
