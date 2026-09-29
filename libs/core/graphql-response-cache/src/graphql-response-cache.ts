import type { BuildResponseCacheKeyFunction } from '@graphql-yoga/plugin-response-cache';
import {
  hashSHA256,
  useResponseCache,
} from '@graphql-yoga/plugin-response-cache';
import type { Cache } from '@nestjs/cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Plugin } from 'graphql-yoga';

import type { CacheEntity } from './cache-manager-response-store';
import { CacheManagerResponseStore } from './cache-manager-response-store';

/** What an application tells the plugin {@link GraphQLResponseCache.plugin} builds. */
export interface GraphQLResponseCachePluginOptions {
  /**
   * Who the caller is, as a string a cache can key by — `null` for a caller with no session. A
   * response is never served to a caller with another answer, and a `PRIVATE` one is not cached for
   * `null`. The credentials the request presents are the usual answer (`RequestCredentials.keyOf`, in
   * `@nestposts/auth`): nothing has to be resolved before the cache is read.
   */
  readonly session: (request: Request) => string | null;
  /**
   * Answer `extensions.responseCache` (`hit`, `didCache`, `ttl`) on every result. Off by default: a
   * subgraph's extensions travel to the gateway with its answer.
   */
  readonly includeExtensionMetadata?: boolean;
}

/**
 * **GraphQL response caching for a Yoga server, stored in the Nest cache manager.**
 *
 * `plugin()` is `@graphql-yoga/plugin-response-cache`, configured so that NOTHING is cached until the
 * schema says so: the global TTL is zero, and a type or a field opts in with
 * `@cacheControl(maxAge: <seconds>, scope: PUBLIC | PRIVATE)` in the SDL. A query is answered from
 * the cache only while no mutation — in this process or any other sharing the cache — returned an
 * entity it contains; what changes outside a mutation is invalidated with {@link invalidate}.
 *
 * The key is the operation, its variables, the caller and the tenant:
 * - the caller is what the application's `session` answers — a response is never served to a caller
 *   with another answer;
 * - a caller it answers `null` for has no session, so a `PRIVATE` type is not cached for them at
 *   all, and what is `PUBLIC` is shared by every anonymous caller;
 * - `x-tenant` is part of every key, anonymous or not, so no tenant ever reads another's.
 *
 * `CACHE_MANAGER` must be global (`CacheModule.registerAsync({ isGlobal: true, … })`).
 */
@Injectable()
export class GraphQLResponseCache {
  static readonly MAX_TTL_MS = 60 * 60_000;
  static readonly SETTLE_MS = 5_000;

  private readonly store: CacheManagerResponseStore;

  constructor(@Inject(CACHE_MANAGER) cache: Cache) {
    this.store = new CacheManagerResponseStore(
      cache,
      GraphQLResponseCache.MAX_TTL_MS,
      GraphQLResponseCache.SETTLE_MS,
    );
  }

  private static readonly keyOf: BuildResponseCacheKeyFunction = ({
    documentString,
    variableValues,
    operationName,
    sessionId,
    request,
  }) =>
    hashSHA256(
      [
        request.headers.get('x-tenant') ?? '',
        sessionId ?? '',
        operationName ?? '',
        documentString,
        JSON.stringify(variableValues ?? {}),
      ].join('|'),
    );

  /** The Yoga plugin: add it to the server's `plugins`, after tracing and error reporting. */
  plugin(options: GraphQLResponseCachePluginOptions): Plugin {
    return useResponseCache({
      cache: this.store,
      ttl: 0,
      session: (request) => options.session(request),
      buildResponseCacheKey: GraphQLResponseCache.keyOf,
      includeExtensionMetadata: options.includeExtensionMetadata ?? false,
    });
  }

  /**
   * Forgets every cached response that contains one of these — an entity (`{ typename, id }`) or a
   * whole type (`{ typename }`: every response that selected one, a list gaining a member included).
   * For a change that does not come back from a mutation of this schema: a saga's, another service's,
   * a projection's. Safe to call inside the transaction that makes the change: nothing containing it
   * is cached again for {@link SETTLE_MS}, which outlasts the commit.
   */
  invalidate(entities: Iterable<CacheEntity>): Promise<void> {
    return this.store.invalidate(entities);
  }
}
