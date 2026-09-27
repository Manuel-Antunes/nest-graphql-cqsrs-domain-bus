import { Injectable, Logger, Optional } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { OutboxInbox } from '@nestjs/outbox';

import type { Ingestion } from '../outbound/transport-metadata';
import { EventLog } from '../persistence/event-log/event-log';
import { RequestContextCodec } from '../request-context';
import { ingesting } from '../tracing';
import { TransportIdentity } from '../transport-identity';
import {
  UnitOfWork,
  UnitOfWorkTransaction,
} from '../unit-of-work/unit-of-work';
import { envelopeOf, messageOf, reconstruct } from './event-reconstruction';
import { InboxDescriptions } from './inbox-descriptions';

/**
 * **The inbound half: an event that arrived becomes an event of this process, exactly once.**
 *
 * ## This is the MECHANISM. The application declares the channels
 * There is no `@EventPattern` here and no queue name: this class takes an event and puts it into the
 * process. Each service writes its own controllers — one per purpose, each bound to its own routing
 * key — in `interfaces/messaging`.
 *
 * Upstream puts a single `@EventPattern(TRANSPORT_EVENT_BUS_PATTERN)` in the application and
 * republishes whatever arrives. That is the right shape and one channel short: **which slices of the
 * flow this machine ingests** is the application's decision, and a single channel means every event
 * that interests the service comes through one queue — which costs failure isolation (a poison message
 * of one type is rejected along with the flow of the others), throughput per slice, and a topology that
 * describes the system when you list the broker's bindings.
 *
 * ## What it receives
 * The `OutboxEnvelope` the producer's outbox published, as the controller took it with `@Payload()`
 * — `@nestjs/outbox`'s own consumer pattern. The event is rebuilt from it here, as an instance of its
 * real class and marked with where it came from; a payload that is not an envelope is a wiring
 * mistake, refused by name rather than quietly skipping the inbox.
 *
 * ## The three guards that make each delivery one thing
 * In order, and each covers what the others do not:
 * 1. **origin**: an event this service produced and got back is dropped. It cuts the resend loop;
 * 2. **inbox**: `@nestjs/outbox`'s {@link OutboxInbox} records `(this service, the message)` in the
 *    SAME transaction as everything the message causes — the unit of work's, through its handle. A
 *    redelivery finds the row and does nothing;
 * 3. **the aggregate**: the handler on the other side decides against its own state. It is the last
 *    line of defence and the only one that survives an emptied inbox.
 *
 * ## What the transaction covers — everything
 * One message is one unit of work, and the unit runs in a transaction: the inbox row, the
 * {@link EventLog} append, every reaction the event sets off on the local bus (a projection, a saga's
 * command — they join the unit) and whatever those reactions publish, which goes to the outbox. It
 * commits whole or rolls back whole, so a reaction that fails takes the inbox row with it and the
 * redelivery is new again; a crash in the middle leaves nothing half-remembered.
 *
 * The event reaches the local bus while the transaction is open, because that is what makes its
 * reactions part of it. What reacts WITHOUT being tracked by the unit — a subscription's stream —
 * sees it before the transaction commits, and must read what the event carries rather than query for
 * what the reactions wrote.
 */
@Injectable()
export class EventIngestion {
  private readonly logger = new Logger(EventIngestion.name);

  constructor(
    private readonly inbox: OutboxInbox,
    private readonly transaction: UnitOfWorkTransaction,
    private readonly context: RequestContextCodec,
    private readonly eventBus: EventBus,
    private readonly identity: TransportIdentity,
    /**
     * Typed `EventLog` and not `EventLog | undefined`: a union makes `tsc` emit `Object` as the
     * `design:paramtypes` entry, and Nest then has no token to resolve — the parameter arrives
     * `undefined` even when the log is bound, and nothing says so.
     */
    @Optional() private readonly log?: EventLog,
    @Optional() private readonly descriptions?: InboxDescriptions,
  ) {}

  /** The name this service's inbox rows are kept under: its own, which never changes. */
  get consumer(): string {
    return this.identity.applicationName;
  }

  /**
   * Ingests one event. It is what each application's controllers call.
   *
   * A failure is logged **and rethrown**: the log exists because a transport that rejects a message
   * usually does not say why — from the outside the integration simply does not happen, and the only
   * sign is a saga that never closes. The rethrow keeps the message rejected, which is the right
   * behaviour for a poison message, and gives the transport's retry something to act on.
   *
   * **One message, one unit of work** — which is what makes the caller's `await` mean "the whole
   * thing", not "the transaction". Publishing an ingested event sets off the saga and the projections,
   * and `@nestjs/cqrs` hands them the event and returns. Whoever called this — `processSqsEvent`, in a
   * function — would otherwise answer while the saga was still deciding, and Lambda freezes the
   * container the moment the handler returns. Inside a unit, that work registers itself and the unit
   * waits for it, so this promise covers the chain.
   */
  async ingest(delivered: OutboxEnvelope): Promise<void> {
    try {
      const envelope = envelopeOf(delivered);
      const message = messageOf(envelope);
      if (message.origin && message.origin === this.identity.applicationName) {
        this.logger.debug(
          `inbox ← ${message.messageType} (${message.identifier}) dropped: this service's own echo`,
        );
        return;
      }

      /**
       * Decoded **once**, here, and handed both to the unit and to the publish. Decoding it twice
       * would make two `AsyncContext` objects for one message, and the unit would then not recognise
       * the command a saga dispatches with the request it received — a unit of its own, untracked,
       * and the Lambda freeze is back.
       */
      const context = this.context.decode(message);
      const event = reconstruct(envelope);

      /**
       * The span is **outside** the unit of work, and that is the whole point of the order: what the
       * reactions publish is staged while they run and recorded at the unit's prepare phase, and the
       * `traceparent` it carries is the one active then. With the span inside the unit, every
       * message this service produced would go out with none, and the next service would open a
       * trace of its own.
       */
      await ingesting(message, () =>
        UnitOfWork.run(() => this.admit(event, message, context), context, {
          failOnTrackedFailure: true,
          transaction: this.transaction,
        }),
      );
    } catch (failure) {
      this.logger.error(
        `inbox ← failed to ingest ${(delivered as Partial<OutboxEnvelope>)?.topic ?? 'a message'}; it will be REJECTED`,
        failure instanceof Error ? failure.stack : String(failure),
      );
      throw failure;
    }
  }

  private async admit(
    event: object,
    message: Ingestion,
    context?: AsyncContext,
  ): Promise<void> {
    const transaction = UnitOfWork.current()?.transactionHandle;
    const outcome = await this.inbox.processInTransaction(
      transaction,
      this.consumer,
      message.identifier,
      async () => {
        this.logger.debug(
          `inbox ← ${message.messageType} (${message.identifier}) from '${message.origin ?? 'unknown'}'`,
        );
        await this.descriptions?.describeInbox(
          transaction,
          this.consumer,
          message.identifier,
          message,
        );
        await this.log?.append([event]);
        this.publish(event, context);
      },
    );
    if (outcome.duplicate) {
      this.logger.log(
        `inbox ← ${message.messageType} (${message.identifier}) dropped: already ingested`,
      );
    }
  }

  /**
   * On the **local** bus — never on the transport one, which would offer the event straight back to
   * the destinations. The origin mark would refuse it, but publishing it there would still be saying
   * the wrong thing.
   */
  private publish(event: object, context?: AsyncContext): void {
    if (context) {
      this.eventBus.publish(event, context);
      return;
    }
    this.eventBus.publish(event);
  }
}
