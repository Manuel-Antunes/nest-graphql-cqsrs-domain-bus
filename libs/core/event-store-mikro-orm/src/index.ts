/**
 * **event-store-mikro-orm** — `@nestposts/transport-eventbus`'s event store on MikroORM and
 * PostgreSQL: one table, `transport.event_log`, and the engine that appends to it on condition and
 * reads it back.
 *
 * | | what | where it goes |
 * |---|---|---|
 * | {@link MikroOrmEventStoreModule} | the table and the engine | the application's root |
 * | {@link MikroOrmEventStorageEngine} | Axon 5's `EventStorageEngine`, with dynamic consistency boundaries | `TransportEventBusModule`'s `eventStore.engine` |
 * | {@link eventStoreEntities} | the table, for a connection that lists its entities itself | the migrator |
 *
 * It depends on MikroORM and `@nestposts/database`, and on nothing of the bus that appends to it.
 */

export * from './event-store.entities';
export * from './mikro-orm-event-storage-engine';
export * from './mikro-orm-event-store.module';
