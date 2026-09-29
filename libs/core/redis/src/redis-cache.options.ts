import KeyvRedis from '@keyv/redis';
import type {
  CacheModuleOptions,
  CacheOptionsFactory,
} from '@nestjs/cache-manager';
import { Injectable, Optional } from '@nestjs/common';
import { Keyv } from 'keyv';

import { RedisConnection } from './redis-connection';

/**
 * **The Nest cache on the process's Redis**: `CacheModule.registerAsync({ isGlobal: true, useClass:
 * RedisCacheOptions })`. The store is Keyv's own Redis adapter over the {@link RedisConnection} the
 * application declared — the same client, not a second connection — under the `cache` namespace.
 *
 * Without a `RedisModule` in the application it answers no store, and `@nestjs/cache-manager` keeps
 * its in-memory default: a process that runs without Redis still has a cache, of its own.
 */
@Injectable()
export class RedisCacheOptions implements CacheOptionsFactory {
  static readonly NAMESPACE = 'cache';

  constructor(@Optional() private readonly redis?: RedisConnection) {}

  createCacheOptions(): CacheModuleOptions {
    return this.redis
      ? {
          stores: [
            new Keyv({
              store: new KeyvRedis(this.redis.client),
              namespace: RedisCacheOptions.NAMESPACE,
            }),
          ],
        }
      : {};
  }
}
