import { Inject, Injectable, Logger } from '@nestjs/common';
import { Outbox, OutboxRelay } from '@nestjs/outbox';

import {
  TRANSPORT_OUTBOX_DESTINATIONS,
  TRANSPORT_OUTBOX_SETTINGS,
} from '../constants';
import { EventMessages } from '../outbound/event-messages';
import { OutboxRoute } from '../outbound/outbox-route';
import { UnitOfWorkTransaction } from '../unit-of-work/unit-of-work';
import type { TransportOutboxSettings } from './transport-outbox.options';

/**
 * **Where an event that leaves the process is written, instead of being sent.**
 *
 * `TransportEventBusService` hands it the events a unit of work staged, in the unit's `prepareCommit`
 * phase and so inside its transaction: each one whose namespace has a destination becomes one
 * message of the outbox ({@link EventMessages}), written with `Outbox.add(tx, …)` through the unit's
 * own transaction handle, and so committed with the writes that raised it or rolled back with them.
 * Nothing reaches a broker here — the relay publishes the message through the destination's
 * `ClientProxyTransport` once the transaction has committed, and again until a broker takes it.
 *
 * The outbox is the application's `OutboxModule`, global; this only writes to it and tells its relay.
 */
@Injectable()
export class EventOutbox {
  private static readonly MAX_DRAIN_ROUNDS = 10;

  private readonly logger = new Logger(EventOutbox.name);

  /** The transaction a publish that no unit of work staged is recorded in: its own. */
  readonly detached: UnitOfWorkTransaction;

  private readonly destinations: ReadonlySet<string>;

  constructor(
    private readonly outbox: Outbox,
    private readonly relay: OutboxRelay,
    private readonly messages: EventMessages,
    transaction: UnitOfWorkTransaction,
    @Inject(TRANSPORT_OUTBOX_SETTINGS)
    private readonly settings: TransportOutboxSettings,
    @Inject(TRANSPORT_OUTBOX_DESTINATIONS) destinations: readonly string[],
  ) {
    this.detached = transaction.detached();
    this.destinations = new Set(destinations);
  }

  /** Whether any of these events leaves the process — and so owes the outbox a row. */
  leaves(events: readonly object[]): boolean {
    return events.some(
      (event) => this.messages.of(event, this.destinations) !== undefined,
    );
  }

  /**
   * Whether the outbox delivers this event `local` — to this process's bus, through the relay, once
   * its unit of work has committed — so the commit must not tell it too. Only with the outbox's
   * route in the settings ({@link TransportOutboxSettings.route}).
   */
  deliversLocally(event: object): boolean {
    const route = this.settings.route;
    if (!route) {
      return false;
    }
    const message = this.messages.of(event, this.destinations);
    return (
      message !== undefined &&
      route({ headers: message.headers ?? {} }) === OutboxRoute.LOCAL
    );
  }

  /** Whether this bus knows which events the outbox delivers `local` — see {@link deliversLocally}. */
  get routesLocally(): boolean {
    return this.settings.route !== undefined;
  }

  /**
   * Writes the events a destination takes through `transaction` — the handle of the transaction the
   * unit of work is in ({@link UnitOfWork.transactionHandle}).
   */
  async stage(events: readonly object[], transaction: unknown): Promise<void> {
    const messages = events.flatMap(
      (event) => this.messages.of(event, this.destinations) ?? [],
    );
    if (messages.length === 0) {
      return;
    }
    await this.outbox.add(transaction, messages);
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
