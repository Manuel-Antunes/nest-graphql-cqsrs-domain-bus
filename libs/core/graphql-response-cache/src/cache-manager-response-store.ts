import { randomUUID } from 'node:crypto';
import type { Cache as ResponseStore } from '@graphql-yoga/plugin-response-cache';
import type { Cache } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import type { ExecutionResult } from 'graphql';

/** What a response is about: a type, or one entity of it. */
export interface CacheEntity {
  readonly typename: string;
  readonly id?: number | string;
}

interface StoredResponse {
  readonly result: ExecutionResult;
  readonly versions: Readonly<Record<string, string | null>>;
}

type CachedResult = Awaited<ReturnType<ResponseStore['get']>>;

/**
 * **The response cache's store, in the Nest cache manager** — so it lives wherever the application's
 * `CacheModule` does: Redis when there is one, shared by every process, memory otherwise.
 *
 * Invalidation is by VERSION, not by index. Every type and every entity has a version key; a response
 * is stored with the versions of everything it contains, and served only while they all still hold.
 * Invalidating replaces the version — one write, no read-modify-write of a list of responses, so two
 * processes invalidating at once cannot lose each other's work, and nothing has to be scanned. A
 * version key lives as long as the longest response may ({@link maxTtlMs}), which is what keeps a
 * version that expired from ever matching a response stored before it.
 *
 * **A change settles before anything containing it is cached again** ({@link settleMs}). A version
 * carries the moment it was replaced, and a response that contains something replaced less than that
 * long ago is not stored. Without it, a query that was already executing when the change committed —
 * or that ran between the invalidation and the commit — would store what it read before, under the NEW
 * version, and serve it until its TTL; the stores `@envelop/response-cache` ships have exactly that
 * race. It is also what lets an application invalidate inside the transaction that makes the change.
 *
 * **Nothing here rejects.** The plugin calls `set` and `invalidate` without awaiting them, so a
 * rejection would be an unhandled one — which ends a Node process — and a store that is down turns
 * `get` into a miss: the cache failing never fails a request, it only stops caching, and says so.
 */
export class CacheManagerResponseStore implements ResponseStore {
  static readonly PREFIX = 'graphql-response';

  private readonly logger = new Logger(CacheManagerResponseStore.name);

  constructor(
    private readonly cache: Cache,
    readonly maxTtlMs: number,
    readonly settleMs: number,
  ) {}

  private static changedAt(version: string | null): number {
    return version ? Number(version.split(':')[0]) || 0 : 0;
  }

  static responseKey(id: string): string {
    return `${CacheManagerResponseStore.PREFIX}:response:${id}`;
  }

  static typeKey(typename: string): string {
    return `${CacheManagerResponseStore.PREFIX}:version:${typename}`;
  }

  static entityKey(typename: string, id: number | string): string {
    return `${CacheManagerResponseStore.PREFIX}:version:${typename}:${id}`;
  }

  private static versionKeysOf(entity: CacheEntity): string[] {
    const type = CacheManagerResponseStore.typeKey(entity.typename);
    return entity.id == null
      ? [type]
      : [type, CacheManagerResponseStore.entityKey(entity.typename, entity.id)];
  }

  private static invalidatedKeyOf(entity: CacheEntity): string {
    return entity.id == null
      ? CacheManagerResponseStore.typeKey(entity.typename)
      : CacheManagerResponseStore.entityKey(entity.typename, entity.id);
  }

  get(id: string): Promise<CachedResult> {
    return this.failingSoftly('read', undefined, async () => {
      const stored = await this.cache.get<StoredResponse>(
        CacheManagerResponseStore.responseKey(id),
      );
      if (!stored) return undefined;
      return (await this.stillHolds(stored.versions))
        ? (stored.result as CachedResult)
        : undefined;
    });
  }

  set(
    id: string,
    result: ExecutionResult,
    entities: Iterable<CacheEntity>,
    ttl: number,
  ): Promise<void> {
    const recorded = [...entities];
    return this.failingSoftly('write', undefined, () =>
      this.store(id, result, recorded, ttl),
    );
  }

  invalidate(entities: Iterable<CacheEntity>): Promise<void> {
    const recorded = [...entities];
    return this.failingSoftly('invalidate', undefined, () =>
      this.replaceVersionsOf(recorded),
    );
  }

  private async store(
    id: string,
    result: ExecutionResult,
    entities: readonly CacheEntity[],
    ttl: number,
  ): Promise<void> {
    const keys = [
      ...new Set(
        [...entities].flatMap(CacheManagerResponseStore.versionKeysOf),
      ),
    ];
    const versions = await this.versionsOf(keys);
    if (this.stillSettling(versions)) return;
    await this.cache.set<StoredResponse>(
      CacheManagerResponseStore.responseKey(id),
      { result, versions },
      Math.min(ttl, this.maxTtlMs),
    );
  }

  private async replaceVersionsOf(
    entities: readonly CacheEntity[],
  ): Promise<void> {
    const keys = [
      ...new Set([...entities].map(CacheManagerResponseStore.invalidatedKeyOf)),
    ];
    if (!keys.length) return;
    const version = `${Date.now()}:${randomUUID()}`;
    await this.cache.mset(
      keys.map((key) => ({ key, value: version, ttl: this.maxTtlMs })),
    );
  }

  private async failingSoftly<T>(
    what: string,
    fallback: T,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (failure) {
      this.logger.warn(
        `the response cache could not ${what}: ${(failure as Error)?.message ?? String(failure)}`,
      );
      return fallback;
    }
  }

  private async versionsOf(
    keys: readonly string[],
  ): Promise<Record<string, string | null>> {
    if (!keys.length) return {};
    const values = await this.cache.mget<string>([...keys]);
    return Object.fromEntries(keys.map((key, i) => [key, values[i] ?? null]));
  }

  private stillSettling(
    versions: Readonly<Record<string, string | null>>,
  ): boolean {
    const settledBefore = Date.now() - this.settleMs;
    return Object.values(versions).some(
      (version) => CacheManagerResponseStore.changedAt(version) > settledBefore,
    );
  }

  private async stillHolds(
    versions: Readonly<Record<string, string | null>>,
  ): Promise<boolean> {
    const current = await this.versionsOf(Object.keys(versions));
    return Object.entries(versions).every(
      ([key, version]) => current[key] === version,
    );
  }
}
