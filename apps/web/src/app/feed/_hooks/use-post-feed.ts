'use client';

import { useSuspenseInfiniteQuery } from '@tanstack/react-query';

import { feedPostsOptions } from '../query';

export function usePostFeed() {
  const {
    data,
    error,
    isFetchingNextPage,
    isRefetching,
    fetchNextPage,
    refetch,
  } = useSuspenseInfiniteQuery(feedPostsOptions());

  return {
    connections: data.pages.map((page) => page.posts),
    error,
    loadingMore: isFetchingNextPage,
    refreshing: isRefetching,
    loadMore: () => void fetchNextPage(),
    refresh: () => void refetch(),
  };
}
