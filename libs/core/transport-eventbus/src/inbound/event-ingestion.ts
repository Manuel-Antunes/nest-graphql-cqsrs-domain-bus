import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { OutboxInbox } from '@nestjs/outbox';

import type { EventMessage } from '../messaging/event-message';
import { EventMessages } from '../outbound/event-messages';
import { markIngested } from '../outbound/transport-metadata';
import { ingesting } from '../tracing';
import { TransportEventBusService } from '../transport-event-bus.service';
import { TransportIdentity } from '../transport-identity';
import type { ProcessingContext } from '../unit-of-work/processing-context';
import { TransactionManager } from '../unit-of-work/transaction-manager';
import { UnitOfWorkFactory } from '../unit-of-work/unit-of-work-factory';
import { envelopeOf } from './event-reconstruction';
import { InboxDescriptions } from './inbox-descriptions';

/**
 * **The inbound half: an event that arrived becomes an event of this process, exactly once.**
 *
 * ## This is the MECHANISM. The application declares the channels
 * There is no `@EventPattern` here and no queue name: each service writes its own controllers — one
 * per purpose, each bound to its own routing key — in `interfaces/messaging`, takes the
 * `OutboxEnvelope` with `@Payload()` and hands it here.
 *
 * ## The three guards that make each delivery one thing
 * 1. **origin**: an event this service produced and got back is dropped. It cuts the resend loop;
 * 2. **inbox**: `@nestjs/outbox`'s {@link OutboxInbox} records `(this service, the message)` in the
 *    same transaction as everything the message causes. A redelivery finds the record and does
 *    nothing;
 * 3. **the entity**: the handler on the other side decides against its own state — the last line of
 *    defence, and the only one that survives an emptied inbox.
 *
 * ## One message, one unit of work
 * The unit is given the message before it begins, and in it: the inbox record, then the event handed
 * to the bus — which, in `PREPARE_COMMIT`, appends it to the event store, writes it to the outbox for
 * any streaming group that takes it, and tells the subscribing handlers, inside the transaction. A
 * command a saga dispatches is a unit of its own that joins that transaction, and the delivery waits
 * for it. So the whole chain commits, or rolls back with the inbox record and is redelivered; and
 * the caller's `await` — `processSqsEvent` in a function — means all of it, which is what keeps Lambda
 * from freezing a saga halfway.
 */
@Injectable()
export class EventIngestion {
  private readonly logger = new Logger(EventIngestion.name);

  constructor(
    private readonly inbox: OutboxInbox,
    private readonly units: UnitOfWorkFactory,
    private readonly bus: TransportEventBusService,
    private readonly identity: TransportIdentity,
    @Optional() private readonly descriptions?: InboxDescriptions,
  ) {}

  /** The name this service's inbox records are kept under: its own, which never changes. */
  get consumer(): string {
    return this.identity.applicationName;
  }

  /**
   * Ingests one event. A failure is logged **and rethrown**: a transport that rejects a message
   * rarely says why, and the rethrow keeps the message rejected — which gives the transport's retry
   * something to act on.
   */
  async ingest(delivered: OutboxEnvelope): Promise<void> {
    try {
      const envelope = envelopeOf(delivered);
      const origin = EventMessages.originOf(envelope);
      if (origin && origin === this.identity.applicationName) {
        this.logger.debug(
          `inbox ← ${envelope.topic} (${envelope.id}) dropped: this service's own echo`,
        );
        return;
      }

      const message = EventMessages.read(envelope);
      markIngested(message.payload, origin);

      await ingesting(message, () =>
        this.units
          .create({ identifier: message.identifier, message })
          .executeWithResult((context) =>
            this.admit(context, message, envelope, origin),
          ),
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
    context: ProcessingContext,
    message: EventMessage,
    envelope: OutboxEnvelope,
    origin: string | undefined,
  ): Promise<void> {
    const transaction = TransactionManager.handleOf(context);
    const outcome = await this.inbox.processInTransaction(
      transaction,
      this.consumer,
      envelope.id,
      async () => {
        this.logger.debug(
          `inbox ← ${message.type} (${message.identifier}) from '${origin ?? 'unknown'}'`,
        );
        await this.descriptions?.describeInbox(
          transaction,
          this.consumer,
          envelope.id,
          { messageType: message.type.toString(), origin },
        );
        await this.bus.stage(context, [message]);
      },
    );
    if (outcome.duplicate) {
      this.logger.log(
        `inbox ← ${message.type} (${message.identifier}) dropped: already ingested`,
      );
    }
  }
}
