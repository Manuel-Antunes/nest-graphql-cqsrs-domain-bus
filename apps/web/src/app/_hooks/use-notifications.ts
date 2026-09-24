'use client';

import { useEffect, useRef, useState } from 'react';
import { skipToken, useMutation, useQuery } from '@apollo/client/react';

import { graphql } from '@/gql';

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

export function useUnreadNotificationCount(): number {
  const { data } = useQuery(UnreadNotificationCountQuery, {
    pollInterval: UNREAD_POLL_INTERVAL_MS,
    fetchPolicy: 'cache-and-network',
  });
  return data?.unreadNotificationCount ?? 0;
}

export function useNotificationInbox(open: boolean) {
  const { data, loading, error } = useQuery(
    NotificationsQuery,
    open
      ? {
          variables: { first: NOTIFICATIONS_PAGE_SIZE },
          fetchPolicy: 'cache-and-network',
        }
      : skipToken,
  );
  const [markAllAsRead] = useMutation(MarkAllNotificationsAsReadMutation);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const settled = useRef(false);

  useEffect(() => {
    if (!open) {
      settled.current = false;
      setFresh(new Set());
      return;
    }
    if (settled.current || loading || !data) return;
    settled.current = true;
    const unread = data.notifications
      .filter((notification) => !notification.read)
      .map((notification) => notification.id);
    setFresh(new Set(unread));
    if (unread.length === 0) return;
    void markAllAsRead({
      update: (cache) => {
        for (const id of unread) {
          cache.modify({
            id: cache.identify({ __typename: 'Notification', id }),
            fields: { read: () => true },
          });
        }
        cache.writeQuery({
          query: UnreadNotificationCountQuery,
          data: { unreadNotificationCount: 0 },
        });
      },
    });
  }, [open, loading, data, markAllAsRead]);

  return {
    notifications: data?.notifications ?? [],
    loading: loading && !data,
    error,
    fresh,
  };
}

export function useDeleteNotification() {
  return useMutation(DeleteNotificationMutation, {
    update: (cache, { data }) => {
      const id = data?.deleteNotification;
      if (!id) return;
      cache.evict({ id: cache.identify({ __typename: 'Notification', id }) });
      cache.gc();
    },
    refetchQueries: [UnreadNotificationCountQuery],
  });
}
