import type { AsyncContext } from '@nestjs/cqrs';
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { UnitOfWork } from '@nestposts/cqsrs';
import { inRequestContext } from '@nestposts/database';

import type { Ingestion } from '../outbound/transport-metadata';
import { ingestionOf } from '../outbound/transport-metadata';
import { EventLog } from '../persistence/event-log/event-log';
import { MessageInbox } from '../persistence/message-inbox';
import { RequestContextCodec } from '../request-context';
import { ingesting } from '../tracing';
import { TransportIdentity } from '../transport-identity';

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
 * 2. **inbox**: {@link MessageInbox} writes the identifier in the SAME transaction as the append.
 *    A redelivery finds the row and does nothing;
 * 3. **the aggregate**: the handler on the other side decides against its own state. It is the last
 *    line of defence and the only one that survives an emptied inbox.
 *
 * ## What the transaction covers
 * The inbox row and the {@link EventLog} append. The event reaches the local bus **after**
 * it commits — a handler triggered from inside the transaction inherits it through the async store and
 * then finds it gone (`Transaction is already committed`).
 */
@Injectable()
export class EventIngestion {
  private readonly logger = new Logger(EventIngestion.name);

  constructor(
    private readonly em: EntityManager,
    private readonly inbox: MessageInbox,
    private readonly context: RequestContextCodec,
    private readonly eventBus: EventBus,
    private readonly identity: TransportIdentity,
    /**
     * Typed `EventLog` and not `EventLog | undefined`: a union makes `tsc` emit `Object` as the
     * `design:paramtypes` entry, and Nest then has no token to resolve — the parameter arrives
     * `undefined` even when the log is bound, and nothing says so.
     */
    @Optional() private readonly log?: EventLog,
  ) {}

  /**
   * Ingests one event. It is what each application's controllers call.
   *
   * A failure is logged **and rethrown**: the log exists because a transport that rejects a message
   * usually does not say why — from the outside the integration simply does not happen, and the only
   * sign is a saga that never closes. The rethrow keeps the message rejected, which is the right
   * behaviour for a poison message.
   */
  /**
   * **One message, one unit of work** — which is what makes the caller's `await` mean "the whole
   * thing", not "the transaction".
   *
   * Publishing an ingested event sets off the saga and the projections, and `@nestjs/cqrs` hands
   * them the event and returns. Whoever called this — `processSqsEvent`, in a function — would
   * otherwise answer while the saga was still deciding, and Lambda freezes the container the moment
   * the handler returns: the log ends one line after the saga said what it was about to do. Inside a
   * unit, that work registers itself and the unit waits for it, so this promise covers the chain.
   */
  async ingest(event: object): Promise<void> {
    try {
      const message = this.messageOf(event);
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

      /**
       * The span is **outside** the unit of work, and that is the whole point of the order. What this
       * service publishes in reaction is staged while the handler runs and only leaves at
       * `commit()` — which happens after the work returns. With the span inside the unit, the commit
       * ran after it had ended, `injectTraceContext` found no span in the context, and every message
       * this service produced went out with no `traceparent`: the next service opened a trace of its
       * own and the saga read as one trace per hop.
       */
      await ingesting(message, () =>
        UnitOfWork.run(
          () => this.ingestMessage(event, message, context),
          context,
        ),
      );
    } catch (failure) {
      this.logger.error(
        `inbox ← failed to ingest ${event?.constructor?.name ?? typeof event}; it will be REJECTED`,
        failure instanceof Error ? failure.stack : String(failure),
      );
      throw failure;
    }
  }

  private async ingestMessage(
    event: object,
    message: Ingestion,
    context?: AsyncContext,
  ): Promise<void> {
    await inRequestContext(this.em, async () => {
      const ingested = await this.em.transactional(async () => {
        if (
          !(await this.inbox.register(
            message.identifier,
            message.messageType,
            message.origin,
          ))
        ) {
          this.logger.log(
            `inbox ← ${message.messageType} (${message.identifier}) dropped: already ingested`,
          );
          return false;
        }
        this.logger.debug(
          `inbox ← ${message.messageType} (${message.identifier}) from '${message.origin ?? 'unknown'}'`,
        );
        await this.log?.append([event]);
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
