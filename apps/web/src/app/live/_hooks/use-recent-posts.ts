'use client';

import { useSuspenseQuery } from '@tanstack/react-query';

import { LIVE_WINDOW, recentPostsOptions } from '../query';

export function useRecentPosts() {
  const { data } = useSuspenseQuery(recentPostsOptions());

  return data.posts.edges
    .filter((edge) => edge !== null)
    .map((edge) => edge.node)
    .slice(-LIVE_WINDOW)
    .reverse();
}
