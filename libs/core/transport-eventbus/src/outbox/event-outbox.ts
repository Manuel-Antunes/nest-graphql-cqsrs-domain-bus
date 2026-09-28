import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NewOutboxMessage } from '@nestjs/outbox';
import { Outbox, OutboxRelay } from '@nestjs/outbox';

import {
  TRANSPORT_OUTBOX_DESTINATIONS,
  TRANSPORT_OUTBOX_SETTINGS,
} from '../constants';
import { EventHandlingComponents } from '../eventhandling/event-handling-components';
import { ProcessingGroups } from '../eventhandling/processing-groups';
import type { EventMessage } from '../messaging/event-message';
import { EventMessages } from '../outbound/event-messages';
import { OutboxRoute } from '../outbound/outbox-route';
import type { ProcessingContext } from '../unit-of-work/processing-context';
import { TransactionManager } from '../unit-of-work/transaction-manager';
import type { TransportOutboxSettings } from './transport-outbox.options';

/**
 * **Where an event that must be delivered later is written, instead of being sent.**
 *
 * The bus hands it every batch its unit of work stages, in `PREPARE_COMMIT` and so inside the unit's
 * transaction. Each event becomes up to two kinds of `@nestjs/outbox` message, written with
 * `Outbox.add(tx, …)` through the unit's transaction handle — committed with the writes that raised
 * them, or rolled back with them:
 *
 * - **one for its namespace's destination**, when this service publishes that namespace and the
 *   outbox has a transport for it — the relay publishes it through the destination's
 *   `ClientProxyTransport`, to the other services;
 * - **one per streaming processing group** whose handlers take it — the relay delivers it `local`, to
 *   that group alone (`StreamingGroupDelivery`), in a unit of work of its own.
 *
 * Nothing reaches a broker or a handler here. Once the unit committed, {@link committed} wakes the
 * relay, or drains it where no relay polls.
 */
@Injectable()
export class EventOutbox {
  private static readonly MAX_DRAIN_ROUNDS = 10;

  private readonly logger = new Logger(EventOutbox.name);

  private readonly destinations: ReadonlySet<string>;

  constructor(
    private readonly outbox: Outbox,
    private readonly relay: OutboxRelay,
    private readonly messages: EventMessages,
    private readonly components: EventHandlingComponents,
    private readonly groups: ProcessingGroups,
    @Inject(TRANSPORT_OUTBOX_SETTINGS)
    private readonly settings: TransportOutboxSettings,
    @Inject(TRANSPORT_OUTBOX_DESTINATIONS) destinations: readonly string[],
  ) {
    this.destinations = new Set(destinations);
  }

  /** The outbox messages one event becomes — none when it concerns nobody outside its unit. */
  messagesOf(message: EventMessage): NewOutboxMessage[] {
    const written: NewOutboxMessage[] = [];
    const destination = this.messages.forDestination(
      message,
      this.destinations,
    );
    if (destination && this.hasTransport(destination)) {
      written.push(destination);
    }
    const interested = new Set(this.components.groupsFor(message.payload));
    for (const group of this.groups.streaming) {
      if (interested.has(group)) {
        written.push(this.messages.forGroup(message, group));
      }
    }
    return written;
  }

  /** Whether any of these events owes the outbox a message. */
  concerns(messages: readonly EventMessage[]): boolean {
    return messages.some((message) => this.messagesOf(message).length > 0);
  }

  /**
   * Writes the messages these events become through the transaction of `context`'s unit, and answers
   * whether it wrote any.
   */
  async stage(
    context: ProcessingContext | undefined,
    messages: readonly EventMessage[],
  ): Promise<boolean> {
    const written = messages.flatMap((message) => this.messagesOf(message));
    if (written.length === 0) {
      return false;
    }
    await this.outbox.add(TransactionManager.handleOf(context), written);
    return true;
  }

  /**
   * What happens once a unit of work that staged messages has committed — see {@link OutboxRelayMode}.
   * It never fails the unit: the messages are committed, so failing it would answer an error for work
   * that happened — and a caller retrying would do the work again, not publish it.
   */
  async committed(): Promise<void> {
    switch (this.settings.relay ?? 'poll') {
      case 'poll':
        this.relay.notify();
        return;
      case 'drain':
        await this.drain().catch((failure: unknown) =>
          this.logger.error(
            'the outbox could not be drained after a commit; the next drain of this service will publish it',
            failure instanceof Error ? failure.stack : String(failure),
          ),
        );
        return;
      default:
        return;
    }
  }

  /**
   * Publishes what is due, a batch at a time, while batches publish something. A batch that publishes
   * nothing — the broker is down — ends the drain: its messages were rescheduled with the outbox's
   * backoff, and retrying them here, as soon as they are due again, would spend every attempt they
   * have before the broker is back.
   */
  async drain(): Promise<void> {
    for (let round = 0; round < EventOutbox.MAX_DRAIN_ROUNDS; round += 1) {
      const { claimed, published } = await this.relay.runOnce();
      if (claimed === 0 || published === 0) {
        return;
      }
    }
  }

  /**
   * Whether the outbox has a transport for this destination message. A service with no broker routes
   * every namespace to `local`, where nothing receives a destination message; writing it would only
   * leave a message for the relay to dead-letter.
   */
  private hasTransport(message: NewOutboxMessage): boolean {
    const route = this.settings.route;
    return (
      !route || route({ headers: message.headers ?? {} }) !== OutboxRoute.LOCAL
    );
  }
}
