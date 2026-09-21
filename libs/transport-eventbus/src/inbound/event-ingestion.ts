import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { type AsyncContext, EventBus } from '@nestjs/cqrs';
import { inRequestContext } from '@nestposts/platform/infrastructure/persistence/request-context';
import { MessageInbox } from '../persistence/message-inbox';
import { RequestContextCodec } from '../request-context';
import { type Ingestion, ingestionOf } from '../outbound/transport-metadata';
import { TransportIdentity } from '../transport-identity';
import { IngestionSink } from './ingestion-sink';

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
 * The **event**, already an instance of its real class: the transporter's deserializer
 * ({@link EventEnvelopeDeserializer}) did that, and left on it the mark of where it came from. A
 * message that arrives without that mark is a wiring mistake — the transport was built without the
 * deserializer — and it is refused by name rather than quietly skipping the inbox.
 *
 * ## The three guards that make each delivery one thing
 * In order, and each covers what the others do not:
 * 1. **origin**: an event this service produced and got back is dropped. It cuts the resend loop;
 * 2. **inbox**: {@link MessageInbox} writes the identifier in the SAME transaction as the sink's work.
 *    A redelivery finds the row and does nothing;
 * 3. **the aggregate**: the handler on the other side decides against its own state. It is the last
 *    line of defence and the only one that survives an emptied inbox.
 *
 * ## What the transaction covers
 * The inbox row and whatever the {@link IngestionSink} writes. The event reaches the local bus **after**
 * it commits — a handler triggered from inside the transaction inherits it through the async store and
 * then finds it gone (`Transaction is already committed`).
 */
@Injectable()
export class EventIngestion {
  private readonly logger = new Logger(EventIngestion.name);

  constructor(
    private readonly em: EntityManager,
    private readonly inbox: MessageInbox,
    private readonly sink: IngestionSink,
    private readonly context: RequestContextCodec,
    private readonly eventBus: EventBus,
    private readonly identity: TransportIdentity,
  ) {}

  /**
   * Ingests one event. It is what each application's controllers call.
   *
   * A failure is logged **and rethrown**: the log exists because a transport that rejects a message
   * usually does not say why — from the outside the integration simply does not happen, and the only
   * sign is a saga that never closes. The rethrow keeps the message rejected, which is the right
   * behaviour for a poison message.
   */
  async ingest(event: object): Promise<void> {
    try {
      await this.ingestEvent(event);
    } catch (failure) {
      this.logger.error(
        `inbox ← failed to ingest ${event?.constructor?.name ?? typeof event}; it will be REJECTED`,
        failure instanceof Error ? failure.stack : String(failure),
      );
      throw failure;
    }
  }

  private async ingestEvent(event: object): Promise<void> {
    const message = this.messageOf(event);

    if (message.origin && message.origin === this.identity.applicationName) {
      this.logger.debug(
        `inbox ← ${message.messageType} (${message.identifier}) dropped: this service's own echo`,
      );
      return;
    }

    const context = this.context.decode(message);

    await inRequestContext(this.em, async () => {
      const ingested = await this.em.transactional(async () => {
        if (!(await this.inbox.register(message.identifier, message.messageType, message.origin))) {
          this.logger.log(
            `inbox ← ${message.messageType} (${message.identifier}) dropped: already ingested`,
          );
          return false;
        }
        this.logger.debug(
          `inbox ← ${message.messageType} (${message.identifier}) from '${message.origin ?? 'unknown'}'`,
        );
        await this.sink.receive(event, context);
        return true;
      });

      if (ingested) {
        this.publish(event, context);
      }
    });
  }

  /**
   * On the **local** bus, and after the transaction — never on the transport one, which would offer
   * the event straight back to the destinations. The origin mark would refuse it, but publishing it
   * there would still be saying the wrong thing.
   */
  private publish(event: object, context?: AsyncContext): void {
    if (context) {
      this.eventBus.publish(event, context);
      return;
    }
    this.eventBus.publish(event);
  }

  private messageOf(event: object): Ingestion {
    const message = ingestionOf(event);
    if (!message) {
      throw new TypeError(
        `${event?.constructor?.name ?? typeof event} did not come through @TransportEvent(): there ` +
          `is no message to remember, so the inbox cannot tell a redelivery from a new fact. Take ` +
          `the parameter with @TransportEvent(), and declare the transport's ` +
          `EventEnvelopeDeserializer in its options.`,
      );
    }
    return message;
  }
}
