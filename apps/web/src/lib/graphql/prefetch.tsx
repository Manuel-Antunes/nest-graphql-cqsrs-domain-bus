import 'server-only';
import './execute.server';

import type {
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  QueryKey,
} from '@tanstack/react-query';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { makeQueryClient } from '@/lib/query-client';

export async function PrefetchQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
>({
  options,
  children,
}: {
  options: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey>;
  children: React.ReactNode;
}) {
  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(options);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  );
}

export async function PrefetchInfiniteQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
  TPageParam,
>({
  options,
  children,
}: {
  options: FetchInfiniteQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >;
  children: React.ReactNode;
}) {
  const queryClient = makeQueryClient();
  await queryClient.prefetchInfiniteQuery(options);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  );
}
