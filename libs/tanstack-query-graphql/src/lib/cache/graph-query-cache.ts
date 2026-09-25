import type { Query, QueryKey } from '@tanstack/react-query';
import { notifyManager, QueryCache } from '@tanstack/react-query';

import { GraphCache } from '../helpers';
import {
  evictQueryFromGraphCache,
  isGraphQLQueryKey,
  readQueryFromGraphCache,
  writeQueryToGraphCache,
} from './apollo-helpers';

/**
 * GraphQueryCache integrates React Query with Apollo Cache for GraphQL queries.
 *
 * When a query key starts with "graph", this cache:
 * 1. Stores query results in Apollo's normalized cache
 * 2. Retrieves data from Apollo cache on subsequent requests
 * 3. Handles cache invalidation through Apollo's cache system
 *
 * Query key structure: ["graph", queryString, variables]
 */
export class GraphQueryCache extends QueryCache {
  constructor(
    private apolloCache: GraphCache,
    config?: ConstructorParameters<typeof QueryCache>[0],
  ) {
    super(config);

    // Set up notification listener for query updates
    this.subscribe(
      notifyManager.batchCalls((event) => {
        if (event?.type === 'updated' && event.query) {
          this.handleQueryUpdate(event.query);
        }
      }),
    );
  }

  /**
   * Infinite queries store `InfiniteData` (`{ pages, pageParams }`) rather than a
   * raw GraphQL result, so their state never matches the document shape that
   * Apollo's normalized cache is keyed on — writing throws "Missing field" and
   * reading returns null. Skip them entirely; they are served from React Query.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isInfiniteQuery(query: Query<any, any, any, any>): boolean {
    const options = query.options as { getNextPageParam?: unknown };
    if (typeof options?.getNextPageParam === 'function') {
      return true;
    }
    const data = query.state.data as
      | { pages?: unknown; pageParams?: unknown }
      | undefined;
    return Array.isArray(data?.pages) && Array.isArray(data?.pageParams);
  }

  /**
   * Handles query updates and syncs to Apollo Cache
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleQueryUpdate(query: Query<any, any, any, any>): void {
    if (!isGraphQLQueryKey(query.queryKey) || this.isInfiniteQuery(query)) {
      return;
    }

    if (query.state.status === 'success' && query.state.data !== undefined) {
      const [, queryString, variables] = query.queryKey;
      writeQueryToGraphCache(
        this.apolloCache,
        queryString as string,
        variables as Record<string, unknown>,
        query.state.data,
      );
    }
  }

  /**
   * A query that arrives WITH data — dehydrated by the server, or given
   * `initialData` — is the newer source, and is written into Apollo: `build`
   * adds it with its state already set, so no `updated` event would ever carry
   * it there. Only a query that arrives empty is filled from Apollo.
   */
  override add<
    TQueryFnData = unknown,
    TError = Error,
    TData = TQueryFnData,
    TQueryKey extends QueryKey = readonly unknown[],
  >(query: Query<TQueryFnData, TError, TData, TQueryKey>): void {
    super.add(query);

    if (!isGraphQLQueryKey(query.queryKey)) {
      return;
    }

    if (query.state.data === undefined) {
      this.hydrateQueryFromApollo(query);
    } else {
      this.handleQueryUpdate(query);
    }
  }

  /**
   * Override remove to evict from Apollo Cache
   */
  override remove(query: Query): void {
    // Evict from Apollo Cache if it's a GraphQL query
    if (isGraphQLQueryKey(query.queryKey)) {
      const [, queryString, variables] = query.queryKey;
      evictQueryFromGraphCache(
        this.apolloCache,
        queryString as string,
        variables as Record<string, unknown>,
      );
    }

    // Remove from React Query cache
    super.remove(query);
  }

  /**
   * Hydrates a query's state from Apollo Cache if available
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hydrateQueryFromApollo(query: Query<any, any, any, any>): void {
    if (!isGraphQLQueryKey(query.queryKey) || this.isInfiniteQuery(query)) {
      return;
    }

    const [, queryString, variables] = query.queryKey;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedData = readQueryFromGraphCache<any>(
      this.apolloCache,
      queryString as string,
      variables as Record<string, unknown>,
    );

    if (cachedData !== null) {
      // Update query state with Apollo cached data
      query.setState({
        data: cachedData,
        dataUpdateCount: query.state.dataUpdateCount + 1,
        dataUpdatedAt: Date.now(),
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        fetchMeta: null,
        fetchStatus: 'idle',
        status: 'success',
      });
    }
  }

  /**
   * Clears Apollo cache entries for removed queries
   */
  override clear(): void {
    // Get all GraphQL queries before clearing
    const graphqlQueries = this.getAll().filter((query) =>
      isGraphQLQueryKey(query.queryKey),
    );

    // Evict them from Apollo Cache
    graphqlQueries.forEach((query) => {
      if (isGraphQLQueryKey(query.queryKey)) {
        const [, queryString, variables] = query.queryKey;
        evictQueryFromGraphCache(
          this.apolloCache,
          queryString as string,
          variables as Record<string, unknown>,
        );
      }
    });

    // Clear React Query cache
    super.clear();
  }
}
