import { environmentManager, QueryClient } from '@tanstack/react-query';

const STALE_AFTER_MS = 5_000;

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: STALE_AFTER_MS } },
  });

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) {
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
