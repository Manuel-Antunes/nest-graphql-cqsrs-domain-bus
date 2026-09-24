'use client';

import { useState } from 'react';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@nestposts/ui/components/ui/popover';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import { BellIcon, BellOffIcon } from 'lucide-react';

import { NotificationItem } from '@/app/_components/notification-item';
import {
  useNotificationInbox,
  useUnreadNotificationCount,
} from '@/app/_hooks/use-notifications';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotificationCount();
  const { notifications, loading, error, fresh } = useNotificationInbox(open);
  const hasUnread = unread > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              hasUnread ? `Notifications, ${unread} unread` : 'Notifications'
            }
            data-unread={hasUnread || undefined}
            className={cn(
              'relative',
              hasUnread &&
                'after:absolute after:top-1.5 after:right-1.5 after:size-2 after:rounded-full after:bg-amber-400 after:ring-2 after:ring-background',
            )}
          />
        }
      >
        <BellIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 overflow-hidden p-0">
        <PopoverHeader className="flex-row items-center justify-between border-b px-3 py-2.5">
          <PopoverTitle>Notifications</PopoverTitle>
          {fresh.size > 0 ? (
            <span className="font-medium text-amber-600 text-xs dark:text-amber-400">
              {fresh.size} new
            </span>
          ) : null}
        </PopoverHeader>
        {loading ? (
          <div className="flex flex-col gap-3 p-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="size-7 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-destructive text-sm">
            The notifications could not be loaded.
          </p>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-muted-foreground">
            <BellOffIcon className="size-5" aria-hidden />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <ul
            aria-label="Notifications"
            className="max-h-96 divide-y overflow-y-auto overscroll-contain"
          >
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                fresh={fresh.has(notification.id)}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
