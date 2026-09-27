import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Outbox, OutboxRelay } from '@nestjs/outbox';
import type { UnitOfWorkTransaction } from '@nestposts/cqsrs';

import {
  TRANSPORT_OUTBOX_DESTINATIONS,
  TRANSPORT_OUTBOX_SETTINGS,
} from '../constants';
import { EventMessages } from '../outbound/event-messages';
import { MikroOrmUnitOfWorkTransaction } from '../persistence/mikro-orm-unit-of-work.transaction';
import { MikroOrmOutboxStore } from '../persistence/outbox/mikro-orm-outbox.store';
import type { TransportOutboxSettings } from './transport-outbox.options';

/**
 * **Where an event that leaves the process is written, instead of being sent.**
 *
 * `TransportEventBusService` hands it the events a unit of work staged, in the unit's `prepareCommit`
 * phase and so inside its transaction: each one whose namespace has a destination becomes one
 * message of the outbox ({@link EventMessages}), written with `Outbox.add(tx, …)` and so committed
 * with the writes that raised it or rolled back with them. Nothing reaches a broker here — the relay
 * publishes the message through the destination's `ClientProxyTransport` once the transaction has
 * committed, and again until a broker takes it.
 */
@Injectable()
export class EventOutbox {
  private static readonly MAX_DRAIN_ROUNDS = 10;

  private readonly logger = new Logger(EventOutbox.name);

  /** The transaction a publish that no unit of work staged is recorded in: its own. */
  readonly detached: UnitOfWorkTransaction;

  private readonly destinations: ReadonlySet<string>;

  constructor(
    private readonly em: EntityManager,
    private readonly outbox: Outbox<EntityManager>,
    private readonly relay: OutboxRelay,
    private readonly messages: EventMessages,
    @Inject(TRANSPORT_OUTBOX_SETTINGS)
    private readonly settings: TransportOutboxSettings,
    @Inject(TRANSPORT_OUTBOX_DESTINATIONS) destinations: readonly string[],
  ) {
    this.detached = MikroOrmUnitOfWorkTransaction.detached(em);
    this.destinations = new Set(destinations);
  }

  /** Whether any of these events leaves the process — and so owes the outbox a row. */
  leaves(events: readonly object[]): boolean {
    return events.some(
      (event) => this.messages.of(event, this.destinations) !== undefined,
    );
  }

  /** Writes the events a destination takes through the transaction the unit of work is in. */
  async stage(events: readonly object[]): Promise<void> {
    const messages = events.flatMap(
      (event) => this.messages.of(event, this.destinations) ?? [],
    );
    if (messages.length === 0) {
      return;
    }
    await this.outbox.add(MikroOrmOutboxStore.transactionOf(this.em), messages);
  }

  /**
   * What happens once a unit of work that staged rows has committed — see {@link OutboxRelayMode}.
   * It never fails the unit: the rows are committed, and publishing them is the relay's to retry.
   */
  async committed(): Promise<void> {
    switch (this.settings.relay ?? 'poll') {
      case 'poll':
        this.relay.notify();
        return;
      case 'drain':
        await this.drain().catch((failure: unknown) =>
          this.logger.error(
            `the outbox could not be drained after a commit; the relay will publish it later`,
            failure instanceof Error ? failure.stack : String(failure),
          ),
        );
        return;
      default:
        return;
    }
  }

  /** Publishes what is due, a batch at a time, until a batch comes back short. */
  async drain(): Promise<void> {
    const batchSize = this.settings.batchSize ?? 100;
    for (let round = 0; round < EventOutbox.MAX_DRAIN_ROUNDS; round += 1) {
      const { claimed } = await this.relay.runOnce();
      if (claimed < batchSize) {
        return;
      }
    }
  }
}
