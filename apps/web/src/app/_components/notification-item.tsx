'use client';

import Link from 'next/link';
import { Button } from '@nestposts/ui/components/ui/button';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import type { LucideIcon } from 'lucide-react';
import { BellIcon, NewspaperIcon, Trash2Icon } from 'lucide-react';

import { useDeleteNotification } from '@/app/_hooks/use-notifications';
import type { FragmentType } from '@/gql';
import { getFragmentData, graphql } from '@/gql';
import { cn } from '@/lib/utils';

export const NotificationItem_notification = graphql(`
  fragment NotificationItem_notification on Notification {
    id
    type
    data
    createdAt
  }
`);

interface NotificationSummary {
  title: string;
  description?: string;
  href?: string;
  icon: LucideIcon;
}

const summaryOf = (
  type: string,
  data: Record<string, unknown>,
): NotificationSummary => {
  switch (type) {
    case 'posts.PostCreated':
      return {
        title: 'Your post is live',
        description: typeof data.title === 'string' ? data.title : undefined,
        href:
          typeof data.postId === 'string' ? `/posts/${data.postId}` : undefined,
        icon: NewspaperIcon,
      };
    default:
      return { title: type, icon: BellIcon };
  }
};

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

const timeAgo = (date: Date): string => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, threshold] of RELATIVE_UNITS) {
    if (seconds >= threshold) {
      return format.format(-Math.floor(seconds / threshold), unit);
    }
  }
  return 'just now';
};

export function NotificationItem({
  notification,
  fresh,
  onNavigate,
}: {
  notification: FragmentType<typeof NotificationItem_notification>;
  fresh: boolean;
  onNavigate: () => void;
}) {
  const item = getFragmentData(NotificationItem_notification, notification);
  const summary = summaryOf(item.type, item.data);
  const { mutate: remove, isPending: removing } = useDeleteNotification();
  const Icon = summary.icon;

  return (
    <li
      data-fresh={fresh || undefined}
      className={cn(
        'relative flex items-start gap-3 px-3 py-2.5 transition-opacity hover:bg-muted/50',
        fresh &&
          'animate-notification-settle motion-reduce:animate-none motion-reduce:bg-(--notification-fresh)',
        removing && 'opacity-50',
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {summary.href ? (
          <Link
            href={summary.href}
            onClick={onNavigate}
            className="font-medium text-sm after:absolute after:inset-0 hover:underline"
          >
            {summary.title}
          </Link>
        ) : (
          <p className="font-medium text-sm">{summary.title}</p>
        )}
        {fresh ? <span className="sr-only"> (new)</span> : null}
        {summary.description ? (
          <p className="truncate text-muted-foreground text-xs">
            {summary.description}
          </p>
        ) : null}
        <time
          dateTime={item.createdAt}
          className="text-[11px] text-muted-foreground"
        >
          {timeAgo(new Date(item.createdAt))}
        </time>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete notification: ${summary.title}`}
        disabled={removing}
        onClick={() => remove({ id: item.id })}
        className="relative z-10 text-muted-foreground hover:text-destructive"
      >
        {removing ? <Spinner /> : <Trash2Icon />}
      </Button>
    </li>
  );
}
