import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import { eventStoreEntities } from './event-store.entities';
import { MikroOrmEventStorageEngine } from './mikro-orm-event-storage-engine';

/**
 * **The event store's table and engine, on MikroORM** — beside the application's
 * `TransportEventBusModule`, which is told to use it:
 *
 * ```ts
 * @Module({
 *   imports: [
 *     DatabaseModule.forRoot(),
 *     MikroOrmEventStoreModule,
 *     TransportEventBusModule.forRoot({ …, eventStore: { engine: MikroOrmEventStorageEngine } }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * It maps its table through `DatabaseModule.forFeature`, the way every module that owns tables does,
 * and it is global so the bus resolves the engine from wherever it is declared.
 */
@Global()
@Module({
  imports: [DatabaseModule.forFeature(eventStoreEntities)],
  providers: [MikroOrmEventStorageEngine],
  exports: [MikroOrmEventStorageEngine],
})
export class MikroOrmEventStoreModule {}
