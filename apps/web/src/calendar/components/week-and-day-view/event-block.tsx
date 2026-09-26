import type { HTMLAttributes } from 'react';
import { cn } from '@nestposts/ui/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { differenceInMinutes, format, parseISO } from 'date-fns';

import { EventDetailsDialog } from '@/calendar/components/dialogs/event-details-dialog';
import { DraggableEvent } from '@/calendar/components/dnd/draggable-event';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import type { IEvent } from '@/calendar/interfaces';

const calendarWeekEventCardVariants = cva(
  'flex cursor-pointer select-none flex-col gap-0.5 truncate whitespace-nowrap rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  {
    variants: {
      color: {
        blue: 'border-primary/20 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/15 [&_.event-dot]:fill-primary',
        green:
          'border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300 [&_.event-dot]:fill-green-600',
        red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 [&_.event-dot]:fill-red-600',
        yellow:
          'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300 [&_.event-dot]:fill-yellow-600',
        purple:
          'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300 [&_.event-dot]:fill-purple-600',
        orange:
          'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 [&_.event-dot]:fill-orange-600',
        gray: 'border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-500/30 dark:bg-neutral-500/10 dark:text-neutral-300 [&_.event-dot]:fill-neutral-500',

        'blue-dot': 'bg-card text-card-foreground [&_.event-dot]:fill-primary',
        'green-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-green-600',
        'red-dot': 'bg-card text-card-foreground [&_.event-dot]:fill-red-600',
        'orange-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-orange-600',
        'purple-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-purple-600',
        'yellow-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-yellow-600',
        'gray-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-neutral-500',
      },
    },
    defaultVariants: {
      color: 'blue-dot',
    },
  },
);

interface IProps
  extends HTMLAttributes<HTMLDivElement>,
    Omit<VariantProps<typeof calendarWeekEventCardVariants>, 'color'> {
  event: IEvent;
}

export function EventBlock({ event, className }: IProps) {
  const { badgeVariant } = useCalendar();

  const start = parseISO(event.startDate);
  const end = parseISO(event.endDate);
  const durationInMinutes = differenceInMinutes(end, start);
  const heightInPixels = (durationInMinutes / 60) * 96 - 8;

  const color = (
    badgeVariant === 'dot' ? `${event.color}-dot` : event.color
  ) as VariantProps<typeof calendarWeekEventCardVariants>['color'];

  const calendarWeekEventCardClasses = cn(
    calendarWeekEventCardVariants({ color, className }),
    durationInMinutes < 35 && 'justify-center py-0',
  );

  return (
    <DraggableEvent event={event}>
      <EventDetailsDialog event={event}>
        <button
          type="button"
          className={cn(calendarWeekEventCardClasses, 'w-full text-left')}
          style={{ height: `${heightInPixels}px` }}
        >
          <div className="flex items-center gap-1.5 truncate">
            {['mixed', 'dot'].includes(badgeVariant) && (
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                className="event-dot shrink-0"
                aria-hidden="true"
              >
                <circle cx="4" cy="4" r="4" />
              </svg>
            )}

            <p className="truncate font-semibold">{event.title}</p>
          </div>

          {durationInMinutes > 25 && (
            <p>
              {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
            </p>
          )}
        </button>
      </EventDetailsDialog>
    </DraggableEvent>
  );
}
