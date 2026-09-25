'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { graphql } from '@/gql';
import { gqlMutationOptions, gqlQueryOptions } from '@/lib/graphql/gqlpc';

const UNREAD_POLL_INTERVAL_MS = 30_000;
const NOTIFICATIONS_PAGE_SIZE = 20;

const UnreadNotificationCountQuery = graphql(`
  query UnreadNotificationCount {
    unreadNotificationCount
  }
`);

const NotificationsQuery = graphql(`
  query Notifications($first: Int) {
    notifications(first: $first) {
      id
      read
      ...NotificationItem_notification
    }
  }
`);

const MarkAllNotificationsAsReadMutation = graphql(`
  mutation MarkAllNotificationsAsRead {
    markAllNotificationsAsRead
  }
`);

const DeleteNotificationMutation = graphql(`
  mutation DeleteNotification($id: ID!) {
    deleteNotification(id: $id)
  }
`);

const unreadCountOptions = () =>
  gqlQueryOptions(UnreadNotificationCountQuery, {
    refetchInterval: UNREAD_POLL_INTERVAL_MS,
  });

const notificationsOptions = () =>
  gqlQueryOptions(NotificationsQuery, {
    input: { first: NOTIFICATIONS_PAGE_SIZE },
    staleTime: 0,
  });

export function useUnreadNotificationCount(): number {
  const { data } = useQuery(unreadCountOptions());
  return data?.unreadNotificationCount ?? 0;
}

export function useNotificationInbox(open: boolean) {
  const queryClient = useQueryClient();
  const { data, isFetching, error } = useQuery({
    ...notificationsOptions(),
    enabled: open,
  });
  const { mutate: markAllAsRead } = useMutation(
    gqlMutationOptions(MarkAllNotificationsAsReadMutation, {
      onSuccess: () => {
        queryClient.setQueryData(notificationsOptions().queryKey, (current) =>
          current
            ? {
                notifications: current.notifications.map((notification) => ({
                  ...notification,
                  read: true,
                })),
              }
            : current,
        );
        queryClient.setQueryData(unreadCountOptions().queryKey, {
          unreadNotificationCount: 0,
        });
      },
    }),
  );
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const settled = useRef(false);

  useEffect(() => {
    if (!open) {
      settled.current = false;
      setFresh(new Set());
      return;
    }
    if (settled.current || isFetching || !data) return;
    settled.current = true;
    const unread = data.notifications
      .filter((notification) => !notification.read)
      .map((notification) => notification.id);
    setFresh(new Set(unread));
    if (unread.length === 0) return;
    markAllAsRead({});
  }, [open, isFetching, data, markAllAsRead]);

  return {
    notifications: data?.notifications ?? [],
    loading: isFetching && !data,
    error,
    fresh,
  };
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation(
    gqlMutationOptions(DeleteNotificationMutation, {
      updateCache: (cache, { deleteNotification: id }) => {
        cache.evict({ id: cache.identify({ __typename: 'Notification', id }) });
        cache.gc();
      },
      onSuccess: ({ deleteNotification: id }) => {
        queryClient.setQueryData(notificationsOptions().queryKey, (current) =>
          current
            ? {
                notifications: current.notifications.filter(
                  (notification) => notification.id !== id,
                ),
              }
            : current,
        );
        void queryClient.invalidateQueries({
          queryKey: unreadCountOptions().queryKey,
        });
      },
    }),
  );
}
