import type { OnApplicationBootstrap } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { IEvent } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import { filter, merge, Subject } from 'rxjs';

import type { ProcessingContext } from '../unit-of-work/processing-context';
import { TransactionManager } from '../unit-of-work/transaction-manager';

/**
 * **What a subscription hears: events that committed.**
 *
 * The subscribing handlers are told an event in the `PREPARE_COMMIT` of the unit that published it,
 * inside its transaction — and a unit can still roll back after that. A projection that ran then is
 * rolled back with it; a GraphQL subscription that pushed the event to a browser cannot take it back.
 * So what *pipes* the bus — a `@SubscriptionHandler` — reads this instead, which emits each event the
 * unit delivered once the unit has committed, and everything published straight onto `EventBus` as it
 * is published, as before.
 *
 * It decorates the one `EventBus` there is by repointing its observable side in
 * `onApplicationBootstrap`, which runs after `CqrsModule` bound every handler and every saga to
 * `subject$` — they keep what they hold, and only what pipes the bus afterwards reads this. It is the
 * same move `EventSourcedEventBus` makes to read the event store instead, which a service serving
 * subscriptions from several processes installs in its place.
 */
@Injectable()
export class CommittedEvents implements OnApplicationBootstrap {
  private readonly logger = new Logger(CommittedEvents.name);
  private readonly committed = new Subject<IEvent>();
  private readonly held = new WeakSet<object>();

  constructor(private readonly moduleRef: ModuleRef) {}

  onApplicationBootstrap(): void {
    const bus = this.moduleRef.get(EventBus, { strict: false });
    bus.source = merge(
      this.committed,
      bus.subject$.pipe(filter((event) => !this.held.has(event))),
    );
    this.logger.log(
      'what pipes the EventBus hears an event once its unit of work committed',
    );
  }

  /**
   * Keeps `event` from the subscriptions altogether — a streaming group's delivery, which tells its
   * handlers an event the subscriptions already heard when the unit that raised it committed.
   */
  withhold(event: IEvent): void {
    this.held.add(event);
  }

  /**
   * Holds `event` back from the subscriptions until what `context`'s unit wrote is durable — the
   * commit of the transaction that owns it, for a unit that joined another's.
   */
  after(context: ProcessingContext, event: IEvent): void {
    this.held.add(event);
    TransactionManager.afterCommit(context, () => this.committed.next(event));
  }
}
