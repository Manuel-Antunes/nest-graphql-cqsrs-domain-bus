/**
 * **outbox-mikro-orm** — `@nestjs/outbox` on MikroORM and PostgreSQL.
 *
 * | | what | where it goes |
 * |---|---|---|
 * | {@link MikroOrmOutboxModule} | the store for the messages, the dead letters and the inbox, and their tables | beside the application's `OutboxModule` |
 * | {@link MikroOrmTransactionManager} | a unit of work's transaction, whose handle the store writes through | `TransportEventBusModule`'s `transactionManager` |
 *
 * It depends on `@nestjs/outbox` and MikroORM, and on nothing of the bus that writes to the outbox.
 */

export * from './mikro-orm-outbox.module';
export * from './mikro-orm-outbox.module-definition';
export * from './mikro-orm-outbox.store';
export * from './mikro-orm-transaction-manager';
export * from './outbox.entities';
