import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { Duration } from '@nestjs/outbox';

/** What `OutboxHousekeepingModule` is told. Every field has a default. */
export interface OutboxHousekeepingOptions {
  /**
   * How often this process prunes the inbox and checks the outbox's health, or `false` for never: a
   * function has no timer that survives it, and a schedule calls `sweep()` instead. The timer is
   * unreferenced, so it never keeps a process alive. Default `1h`.
   */
  readonly interval?: Duration | false;
  /**
   * How long an inbox remembers a message it processed — longer than any redelivery, a dead letter's
   * requeue included. Default `30d`.
   */
  readonly inboxRetention?: Duration;
  /** A due message that waited longer than this is reported, with the outbox's counts. Default `1m`. */
  readonly lagWarning?: Duration;
  /**
   * The root `OutboxModule`'s `relay.batchSize`, when it is not the default: a sweep publishes
   * batches until one comes back short. Default `100`, the package's.
   */
  readonly batchSize?: number;
}

const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<OutboxHousekeepingOptions>()
  .setClassMethodName('forRoot')
  .setFactoryMethodName('createOutboxHousekeepingOptions')
  .build();

export const ConfigurableOutboxHousekeepingModule = ConfigurableModuleClass;

export const OUTBOX_HOUSEKEEPING_OPTIONS = MODULE_OPTIONS_TOKEN;

/** The `OutboxHousekeepingModule.forRoot` argument. */
export type OutboxHousekeepingModuleRootOptions = typeof OPTIONS_TYPE;

/** The `OutboxHousekeepingModule.forRootAsync` argument, in Nest's usual shapes. */
export type OutboxHousekeepingModuleAsyncOptions = typeof ASYNC_OPTIONS_TYPE;
