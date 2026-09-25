'use client';

import { useCallback, useState } from 'react';
import type { SubscriptionStatus } from '@nestposts/tanstack-query-graphql';

import type { StreamStatus } from '@/app/_components/status-dot';
import { gqlSubscriptionOptions, useSubscription } from '@/lib/graphql/gqlpc';

import { OnPostCreatedSubscription, OnPostUpdatedSubscription } from '../query';

export interface StreamEvent {
  receivedAt: number;
  source: 'onPostCreated' | 'onPostUpdated';
  postId: string;
  title: string;
  version: number;
}

interface StreamedPost {
  id: string;
  title: string;
  version: number;
}

const STREAM_STATUS: Record<SubscriptionStatus, StreamStatus> = {
  idle: 'idle',
  connecting: 'connecting',
  pending: 'open',
  error: 'error',
  complete: 'closed',
};

export function usePostStream(active: boolean) {
  const [events, setEvents] = useState<StreamEvent[]>([]);

  const record = useCallback(
    (source: StreamEvent['source'], post: StreamedPost) => {
      setEvents((current) => [
        {
          receivedAt: Date.now(),
          source,
          postId: post.id,
          title: post.title,
          version: post.version,
        },
        ...current,
      ]);
    },
    [],
  );

  const created = useSubscription(
    gqlSubscriptionOptions(OnPostCreatedSubscription, {
      enabled: active,
      onData: (data) => record('onPostCreated', data.onPostCreated),
    }),
  );

  const updated = useSubscription(
    gqlSubscriptionOptions(OnPostUpdatedSubscription, {
      enabled: active,
      input: {},
      onData: (data) => record('onPostUpdated', data.onPostUpdated),
    }),
  );

  return {
    events,
    clear: () => setEvents([]),
    createdStatus: STREAM_STATUS[created.status],
    updatedStatus: STREAM_STATUS[updated.status],
    error: created.error ?? updated.error,
  };
}
