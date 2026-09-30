import type { RedisConnection } from '@nestposts/redis';
import type { SecondaryStorage } from 'better-auth';

/**
 * **Better Auth's secondary storage, on the process's Redis** — Better Auth's own node-redis
 * implementation, over the one {@link RedisConnection} the application declared, every key under
 * `better-auth:` so it never meets the Nest cache's.
 *
 * Not `@better-auth/redis-storage`: that package takes an ioredis client, and Keyv's Redis adapter —
 * what the Nest cache stands on — takes node-redis. One of the two had to be the documented
 * alternative, or every process would hold two connections through two client libraries.
 *
 * `getAndDelete` and `increment` are atomic, as Better Auth requires: `GETDEL`, and `INCR` with an
 * `EXPIRE … NX` in one transaction — which is Redis 7.
 *
 * Every member Better Auth calls is a function bound to the instance, not a prototype method: its rate
 * limiter takes `secondaryStorage.increment` off the object and calls it bare, and a method called
 * that way has no `this`.
 */
export class RedisSecondaryStorage implements SecondaryStorage {
  static readonly KEY_PREFIX = 'better-auth:';

  constructor(private readonly redis: RedisConnection) {}

  static keyOf(key: string): string {
    return `${RedisSecondaryStorage.KEY_PREFIX}${key}`;
  }

  readonly get = (key: string): Promise<string | null> =>
    this.redis.client.get(RedisSecondaryStorage.keyOf(key));

  readonly getAndDelete = (key: string): Promise<string | null> =>
    this.redis.client.getDel(RedisSecondaryStorage.keyOf(key));

  readonly increment = async (key: string, ttl: number): Promise<number> => {
    if (!Number.isInteger(ttl) || ttl <= 0) {
      throw new TypeError('Redis increment TTL must be a positive integer');
    }
    const stored = RedisSecondaryStorage.keyOf(key);
    const [value] = await this.redis.client
      .multi()
      .incr(stored)
      .expire(stored, ttl, 'NX')
      .execTyped();
    return value;
  };

  readonly set = async (
    key: string,
    value: string,
    ttl?: number,
  ): Promise<void> => {
    const stored = RedisSecondaryStorage.keyOf(key);
    if (ttl && ttl > 0) {
      await this.redis.client.set(stored, value, { EX: ttl });
    } else {
      await this.redis.client.set(stored, value);
    }
  };

  readonly delete = async (key: string): Promise<void> => {
    await this.redis.client.del(RedisSecondaryStorage.keyOf(key));
  };

  /**
   * Forgets everything Better Auth keeps here — what a database that was dropped and recreated needs,
   * or every session it issued would still answer, for users that no longer exist. Walks the prefix
   * with `SCAN`, so it is neither atomic nor blocking.
   */
  async clear(): Promise<number> {
    let forgotten = 0;
    for await (const keys of this.redis.client.scanIterator({
      MATCH: `${RedisSecondaryStorage.KEY_PREFIX}*`,
      COUNT: 100,
    })) {
      if (keys.length) {
        forgotten += await this.redis.client.del(keys);
      }
    }
    return forgotten;
  }
}
