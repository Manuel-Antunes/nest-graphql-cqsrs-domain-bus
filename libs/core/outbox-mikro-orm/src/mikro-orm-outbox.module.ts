import { EntityManager } from '@mikro-orm/core';
import { Module } from '@nestjs/common';
import { OutboxStorage } from '@nestjs/outbox';

import type { MikroOrmOutboxModuleOptions } from './mikro-orm-outbox.module-definition';
import {
  ConfigurableMikroOrmOutboxModule,
  MIKRO_ORM_OUTBOX_OPTIONS,
} from './mikro-orm-outbox.module-definition';
import { MikroOrmOutboxStore } from './mikro-orm-outbox.store';

/**
 * **`@nestjs/outbox`'s storage, on MikroORM** — the store for the messages, their dead letters and
 * the inbox, and the three tables it keeps them in.
 *
 * `@nestjs/outbox` configures no store: "the store is a provider of the app's that registers itself
 * with `OutboxStorage`". This is that provider, as a module, next to the `OutboxModule` it serves:
 *
 * ```ts
 * @Module({
 *   imports: [
 *     DatabaseModule.forRoot(mikroOrmConfig()),
 *     OutboxModule.forRoot({ transports, route: OutboxRoute.over(transports) }),
 *     MikroOrmOutboxModule.forRoot({ producer: 'posts-api' }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * `forRootAsync({ inject, useFactory })` takes the producer from configuration. It is global, so
 * whatever wants the store itself — a spec reading an inbox, `inbox: { descriptions:
 * MikroOrmOutboxStore }` on the transport bus — injects it.
 *
 * It needs the application's `OutboxModule` (global, `@nestjs/outbox`'s default) and its MikroORM
 * connection; it maps its tables through `DatabaseModule.forFeature`, the way every module that owns
 * tables does.
 */
@Module({
  providers: [
    {
      provide: MikroOrmOutboxStore,
      inject: [EntityManager, MIKRO_ORM_OUTBOX_OPTIONS, OutboxStorage],
      useFactory: (
        em: EntityManager,
        { producer }: MikroOrmOutboxModuleOptions,
        storage: OutboxStorage,
      ) => new MikroOrmOutboxStore(em, producer, storage),
    },
  ],
  exports: [MikroOrmOutboxStore],
})
export class MikroOrmOutboxModule extends ConfigurableMikroOrmOutboxModule {}
