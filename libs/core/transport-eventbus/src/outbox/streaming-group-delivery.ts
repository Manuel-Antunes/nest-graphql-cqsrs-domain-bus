import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OutboxHandlerContext } from '@nestjs/outbox';
import {
  NonRetryableMessageError,
  OnOutboxMessage,
  OutboxInbox,
} from '@nestjs/outbox';

import { LocalEventDelivery } from '../eventhandling/local-event-delivery';
import { InboxDescriptions } from '../inbound/inbox-descriptions';
import { EventMessages } from '../outbound/event-messages';
import { TRANSPORT_PROCESSING_GROUP } from '../outbound/message-headers';
import { markIngested } from '../outbound/transport-metadata';
import { ingesting } from '../tracing';
import { TransportIdentity } from '../transport-identity';
import { TransactionManager } from '../unit-of-work/transaction-manager';
import { UnitOfWorkFactory } from '../unit-of-work/unit-of-work-factory';

/**
 * **A streaming processing group, fed by the outbox** — what Axon 5's `PooledStreamingEventProcessor`
 * is, on `@nestjs/outbox`.
 *
 * | Axon 5 | here |
 * |---|---|
 * | the processor reads the event store from its token | the relay claims the group's messages from the outbox |
 * | segments, claimed and extended in the `TokenStore` | leases, fenced by the relay's owner |
 * | `SequencingPolicy`: one sequence handled in order | the message `key`: one key published in order |
 * | the token stored in `PREPARE_COMMIT` of the batch's unit | the inbox record written in the delivery's unit |
 * | a failed batch: rollback, release with backoff, retry | a failed delivery: rollback, reschedule with backoff, retry |
 * | a dead-letter queue, left to an extension | `@nestjs/outbox`'s dead letters, with `requeue` |
 *
 * Each message is one unit of work: the inbox record — through the package's own
 * `OutboxInbox.processInTransaction`, under the service and the group
 * ({@link EventMessages.groupConsumer}, `posts-api/notifications`) — and the delivery to that group's
 * handlers commit together, or roll back together and are retried. The event is the one the publishing unit raised or
 * ingested: restored under its identifier, marked as ingested only if another service produced it,
 * with the request its metadata carries.
 *
 * The unit is given the message before it begins, so a multi-tenant transaction manager opens it in
 * the tenant the message names: the relay delivers outside any request.
 */
@Injectable()
export class StreamingGroupDelivery {
  /**
   * The handler's name to `@nestjs/outbox`, which records nothing under it (`inbox: false`): each
   * delivery is recorded under its own service and group instead.
   */
  static readonly CONSUMER = 'processing-groups';

  private readonly logger = new Logger(StreamingGroupDelivery.name);

  constructor(
    private readonly units: UnitOfWorkFactory,
    private readonly delivery: LocalEventDelivery,
    private readonly inbox: OutboxInbox,
    private readonly identity: TransportIdentity,
    @Optional() private readonly descriptions?: InboxDescriptions,
  ) {}

  /**
   * Every streaming group's messages, on their one topic: the group is in the headers, and the
   * relay's order, retries and dead letters are the message's — one per group.
   */
  @OnOutboxMessage(EventMessages.GROUP_TOPIC, {
    consumer: StreamingGroupDelivery.CONSUMER,
    inbox: false,
  })
  async receive(
    _payload: unknown,
    outbox: OutboxHandlerContext,
  ): Promise<void> {
    const { message } = outbox;
    const envelope = {
      id: message.id,
      topic: message.topic,
      key: message.key,
      headers: message.headers,
      createdAt: message.createdAt,
      payload: message.payload,
    };
    const event = EventMessages.read(envelope);
    const origin = EventMessages.originOf(envelope);
    if (origin && origin !== this.identity.applicationName) {
      markIngested(event.payload, origin);
    }
    const processingGroup = EventMessages.groupOf(envelope);
    if (!processingGroup) {
      throw new NonRetryableMessageError(
        `${message.id} reached the streaming processing groups without naming one (${TRANSPORT_PROCESSING_GROUP})`,
      );
    }

    const consumer = EventMessages.groupConsumer(
      this.identity.applicationName,
      processingGroup,
    );

    await ingesting(event, () =>
      this.units
        .create({ identifier: message.id, message: event })
        .executeWithResult(async (context) => {
          const transaction = TransactionManager.handleOf(context);
          const outcome = await this.inbox.processInTransaction(
            transaction,
            consumer,
            message.id,
            async () => {
              await this.descriptions?.describeInbox(
                transaction,
                consumer,
                message.id,
                {
                  messageType: event.type.toString(),
                  origin,
                },
              );
              await this.delivery.deliver(context, [event], processingGroup);
            },
          );
          if (outcome.duplicate) {
            this.logger.log(
              `${processingGroup} ← ${event.type} (${event.identifier}) dropped: already delivered`,
            );
          }
        }),
    );
  }
}
