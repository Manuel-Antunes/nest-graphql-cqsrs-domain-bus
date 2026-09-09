import type { Subject } from 'rxjs';
import type { ISubscription } from '../interfaces/subscription.interface';
import type { ISubscriptionPublisher } from '../interfaces/subscription-publisher.interface';

/**
 * O publisher padrão: empurra cada subscription pedida para o `Subject` do próprio `SubscriptionBus`
 * — o que torna o bus um `Observable` de "alguém se inscreveu em quê". O espelho do
 * `DefaultQueryPubSub` do @nestjs/cqrs; trocável pela opção `subscriptionPublisher` do módulo.
 */
export class DefaultSubscriptionPubSub<SubscriptionBase extends ISubscription>
  implements ISubscriptionPublisher<SubscriptionBase>
{
  constructor(private readonly subject$: Subject<SubscriptionBase>) {}

  publish<T extends SubscriptionBase = SubscriptionBase>(subscription: T): void {
    this.subject$.next(subscription);
  }
}
