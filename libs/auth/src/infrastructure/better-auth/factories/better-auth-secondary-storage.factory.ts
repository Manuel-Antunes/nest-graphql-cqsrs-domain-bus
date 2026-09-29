import type { FactoryProvider } from '@nestjs/common';
import { RedisConnection } from '@nestposts/redis';

import { RedisSecondaryStorage } from '../storage/redis-secondary-storage';
import { BETTER_AUTH_SECONDARY_STORAGE } from '../tokens';

/**
 * **Whether Better Auth keeps sessions in Redis is the application's `RedisModule`.** Declared at the
 * composition root, its {@link RedisConnection} becomes the secondary storage; absent, there is none
 * and every session is read from the database — the same optional-dependency shape the organization
 * plugin has for tenancy.
 */
export const BetterAuthSecondaryStorageFactory = {
  provide: BETTER_AUTH_SECONDARY_STORAGE,
  inject: [{ token: RedisConnection, optional: true }],
  useFactory: (redis?: RedisConnection): RedisSecondaryStorage | null =>
    redis ? new RedisSecondaryStorage(redis) : null,
} satisfies FactoryProvider<RedisSecondaryStorage | null>;
