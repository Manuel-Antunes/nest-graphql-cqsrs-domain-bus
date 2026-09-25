import type { GraphCache } from '@nestposts/tanstack-query-graphql';
import {
  GraphMutationCache,
  GraphQLResponseError,
  GraphQueryCache,
  InMemoryGraphCache,
} from '@nestposts/tanstack-query-graphql';
import { environmentManager, QueryClient } from '@tanstack/react-query';

import generatedIntrospection from '@/gql/possible-types';

const STALE_AFTER_MS = 5_000;
const BROWSER_RETRIES = 3;

const makeGraphCache = (): GraphCache =>
  new InMemoryGraphCache({
    possibleTypes: generatedIntrospection.possibleTypes,
  });

let browserGraphCache: GraphCache | undefined;

export function getGraphCache(): GraphCache {
  if (environmentManager.isServer()) {
    return makeGraphCache();
  }
  browserGraphCache ??= makeGraphCache();
  return browserGraphCache;
}

const shouldRetry = (failureCount: number, error: Error): boolean =>
  !environmentManager.isServer() &&
  !GraphQLResponseError.is(error) &&
  failureCount < BROWSER_RETRIES;

export const makeQueryClient = () => {
  const graphCache = getGraphCache();

  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: STALE_AFTER_MS, retry: shouldRetry },
    },
    queryCache: new GraphQueryCache(graphCache),
    mutationCache: new GraphMutationCache(graphCache),
  });
};

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) {
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
