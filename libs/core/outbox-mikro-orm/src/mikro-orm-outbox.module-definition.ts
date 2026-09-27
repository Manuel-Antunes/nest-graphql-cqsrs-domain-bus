import type { DynamicModule } from '@nestjs/common';
import { ConfigurableModuleBuilder } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import { outboxEntities } from './outbox.entities';

/** What `MikroOrmOutboxModule` is told. */
export interface MikroOrmOutboxModuleOptions {
  /**
   * The service whose messages the store writes, claims and dead-letters — its own name, the one
   * every message it publishes carries. One `transport` schema serves every service, and a relay
   * publishes only what its own service produced.
   */
  readonly producer: string;
}

/** Global by default, like the `OutboxModule` whose storage it registers with. */
export interface MikroOrmOutboxModuleExtras {
  readonly isGlobal: boolean;
}

/** The module, global, with the outbox's and the inbox's tables mapped wherever it is imported. */
const withOutboxTables = (
  definition: DynamicModule,
  { isGlobal }: MikroOrmOutboxModuleExtras,
): DynamicModule => ({
  ...definition,
  global: isGlobal,
  imports: [
    ...(definition.imports ?? []),
    DatabaseModule.forFeature(outboxEntities),
  ],
});

const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<MikroOrmOutboxModuleOptions>()
  .setClassMethodName('forRoot')
  .setFactoryMethodName('createMikroOrmOutboxOptions')
  .setExtras<MikroOrmOutboxModuleExtras>({ isGlobal: true }, withOutboxTables)
  .build();

export const ConfigurableMikroOrmOutboxModule = ConfigurableModuleClass;

export const MIKRO_ORM_OUTBOX_OPTIONS = MODULE_OPTIONS_TOKEN;

/** The `MikroOrmOutboxModule.forRoot` argument. */
export type MikroOrmOutboxModuleRootOptions = typeof OPTIONS_TYPE;

/** The `MikroOrmOutboxModule.forRootAsync` argument, in Nest's usual shapes. */
export type MikroOrmOutboxModuleAsyncOptions = typeof ASYNC_OPTIONS_TYPE;
