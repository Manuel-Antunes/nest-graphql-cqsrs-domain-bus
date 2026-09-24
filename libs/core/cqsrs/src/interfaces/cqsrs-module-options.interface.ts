import type { InjectionToken } from '@nestjs/common';
import type { CqrsModuleOptions } from '@nestjs/cqrs';

import type { ISubscriptionPublisher } from './subscription-publisher.interface';

/**
 * The `CqsrsModule` options: the `CqrsModule` ones (forwarded to it wholesale) plus the single piece
 * CQSRS adds.
 */
export interface CqsrsModuleOptions extends CqrsModuleOptions {
  /**
   * Where to announce every requested subscription.
   * @default DefaultSubscriptionPubSub (in memory, the bus's own `Subject`)
   */
  subscriptionPublisher?: ISubscriptionPublisher;
}

/**
 * What shapes the module itself rather than configuring it — known while the module is being built,
 * which is before any options factory runs, so it is passed beside the options in both `forRoot` and
 * `forRootAsync` and never returned by a factory.
 */
export interface CqsrsModuleExtras {
  /**
   * What the `EventPublisher` of this application **is**: the token or class every
   * `mergeObjectContext` goes through.
   *
   * With it bound, `constructor(private readonly publisher: EventPublisher)` **is** the application's
   * publisher — in any module, without a token — and a handler cannot pick the wrong one by injecting
   * the obvious thing.
   *
   * Not to be confused with `eventPublisher`, which is the *bus's* outbound strategy (an
   * `IEventPublisher`): this one is the helper an aggregate is merged into.
   *
   * The publisher itself has to come from a **global** module, because this is where the binding is
   * resolved.
   *
   * @default EventPublisher, as `CqrsModule` provides it
   */
  aggregatePublisher?: InjectionToken;
}
