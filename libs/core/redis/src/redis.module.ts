import { Module } from '@nestjs/common';
import type { RedisClientOptions } from '@redis/client';

import {
  ConfigurableRedisModule,
  REDIS_MODULE_OPTIONS,
} from './redis.module-definition';
import { RedisConnection } from './redis-connection';

/**
 * **Redis, declared once at the composition root.** `RedisModule.forRootAsync({ inject, useFactory })`
 * takes node-redis' own client options — the application's `redis.config.ts` decides them; this
 * library reads no environment — and provides {@link RedisConnection}, connected before anything that
 * injects it is built. Global by default: one connection per process.
 */
@Module({
  providers: [
    {
      provide: RedisConnection,
      inject: [REDIS_MODULE_OPTIONS],
      useFactory: (options: RedisClientOptions) =>
        RedisConnection.open(options),
    },
  ],
  exports: [RedisConnection],
})
export class RedisModule extends ConfigurableRedisModule {}
