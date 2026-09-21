import type { Provider } from '@nestjs/common';
import { IngestionSink } from '../../inbound/ingestion-sink';
import { EventStore, MikroOrmEventStore } from './event-store';
import { EventStoreSink } from './event-store.sink';

/**
 * **A service that event-sources, wired.** The store, and the {@link IngestionSink} that appends every
 * ingested event to the stream of the aggregate it names.
 *
 * ```ts
 * @Global()
 * @Module({
 *   imports: [DiscoveryModule],
 *   providers: [
 *     ...transportEventBusProviders,
 *     ...eventIngestionProviders,
 *     ...eventStoreProviders,
 *     EventSourcedRepository.of(Post),
 *     { provide: TransportIdentity, useClass: TaggingIdentity },
 *     { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
 *     { provide: MessageInbox, useClass: MikroOrmMessageInbox },
 *   ],
 * })
 * export class TransportModule {}
 * ```
 *
 * It replaces the `IngestionSink` binding rather than adding to it: a service either makes its streams
 * durable or it does not, and `NoDurableState` is the other answer. The one thing left to declare is
 * `eventStoreEntities` in the MikroORM configuration, because the table is the service's own.
 */
export const eventStoreProviders: readonly Provider[] = [
  MikroOrmEventStore,
  { provide: EventStore, useExisting: MikroOrmEventStore },
  { provide: IngestionSink, useClass: EventStoreSink },
];
