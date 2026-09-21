import { Injectable } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';

/**
 * What an ingested event has to leave behind **inside the ingestion's transaction**, before anything
 * reacts to it.
 *
 * ## Why this is a port
 * Because the Quarkus side appends the incoming event to its local event store, and the store — not
 * the queue — is what feeds the processors. Whether this service has such a store is its own business:
 * - a service that owns the read model has nothing to make durable here. Its projections are handlers,
 *   and they run on the event bus like any other;
 * - a service that **writes to an aggregate it has no table for** has to append the event to its own
 *   stream first, or the next decision is taken against a history missing half its events. That is
 *   what the tagging service's sink does.
 *
 * Whatever it writes lands in the same transaction as the inbox row, which is what keeps the fatal
 * in-between state from existing: work done with no record of receipt, which a redelivery would do
 * twice.
 *
 * ## What it must NOT do
 * Publish. The event reaches the local bus after that transaction commits, and {@link EventIngestion}
 * is what does it — for a measured reason: a handler triggered from inside the transaction inherits
 * its context through the async store, and by the time it runs the transaction is gone. MikroORM says
 * so as `Transaction is already committed`, from a query the handler did not know was in one.
 */
export abstract class IngestionSink {
  abstract receive(event: object, context?: AsyncContext): Promise<void>;
}

/**
 * The default: nothing is made durable. It is the right sink for a service whose state is a read model
 * fed by its own projections — the event reaches them the moment the transaction closes.
 */
@Injectable()
export class NoDurableState extends IngestionSink {
  async receive(): Promise<void> {
    // The inbox row is the whole durable effect of this delivery.
  }
}
