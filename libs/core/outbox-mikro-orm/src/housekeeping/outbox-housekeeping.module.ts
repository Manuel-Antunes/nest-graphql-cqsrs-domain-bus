import { Module } from '@nestjs/common';

import { OutboxHousekeeping } from './outbox-housekeeping';
import { ConfigurableOutboxHousekeepingModule } from './outbox-housekeeping.module-definition';

/**
 * **What running an outbox takes that `@nestjs/outbox` leaves to the application** — see
 * {@link OutboxHousekeeping}.
 *
 * ```ts
 * OutboxHousekeepingModule.forRootAsync({
 *   inject: [outboxConfig.KEY],
 *   useFactory: ({ relay, inboxRetention }: OutboxConfig) => ({
 *     interval: relay === 'poll' ? '1h' : false,
 *     inboxRetention,
 *   }),
 * })
 * ```
 *
 * It needs the application's `OutboxModule`, and nothing about the store behind it.
 */
@Module({
  providers: [OutboxHousekeeping],
  exports: [OutboxHousekeeping],
})
export class OutboxHousekeepingModule extends ConfigurableOutboxHousekeepingModule {}
