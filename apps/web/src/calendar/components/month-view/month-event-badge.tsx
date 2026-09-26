import { cn } from '@nestposts/ui/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { endOfDay, format, isSameDay, parseISO, startOfDay } from 'date-fns';

import { EventDetailsDialog } from '@/calendar/components/dialogs/event-details-dialog';
import { DraggableEvent } from '@/calendar/components/dnd/draggable-event';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import type { IEvent } from '@/calendar/interfaces';

const eventBadgeVariants = cva(
  'mx-1 flex size-auto h-6.5 cursor-pointer select-none items-center justify-between gap-1.5 truncate whitespace-nowrap rounded-md border px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
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
        'yellow-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-yellow-600',
        'purple-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-purple-600',
        'orange-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-orange-600',
        'gray-dot':
          'bg-card text-card-foreground [&_.event-dot]:fill-neutral-500',
      },
      multiDayPosition: {
        first:
          'relative z-10 mr-0 w-[calc(100%_-_3px)] rounded-r-none border-r-0 [&>span]:mr-2.5',
        middle:
          'relative z-10 mx-0 w-[calc(100%_+_1px)] rounded-none border-x-0',
        last: 'ml-0 rounded-l-none border-l-0',
        none: '',
      },
    },
    defaultVariants: {
      color: 'blue-dot',
    },
  },
);

interface IProps
  extends Omit<
    VariantProps<typeof eventBadgeVariants>,
    'color' | 'multiDayPosition'
  > {
  event: IEvent;
  cellDate: Date;
  eventCurrentDay?: number;
  eventTotalDays?: number;
  className?: string;
  position?: 'first' | 'middle' | 'last' | 'none';
}

export function MonthEventBadge({
  event,
  cellDate,
  eventCurrentDay,
  eventTotalDays,
  className,
  position: propPosition,
}: IProps) {
  const { badgeVariant } = useCalendar();

  const itemStart = startOfDay(parseISO(event.startDate));
  const itemEnd = endOfDay(parseISO(event.endDate));

  if (cellDate < itemStart || cellDate > itemEnd) return null;

  let position: 'first' | 'middle' | 'last' | 'none' | undefined;

  if (propPosition) {
    position = propPosition;
  } else if (eventCurrentDay && eventTotalDays) {
    position = 'none';
  } else if (isSameDay(itemStart, itemEnd)) {
    position = 'none';
  } else if (isSameDay(cellDate, itemStart)) {
    position = 'first';
  } else if (isSameDay(cellDate, itemEnd)) {
    position = 'last';
  } else {
    position = 'middle';
  }

  const renderBadgeText = ['first', 'none'].includes(position);

  const color = (
    badgeVariant === 'dot' ? `${event.color}-dot` : event.color
  ) as VariantProps<typeof eventBadgeVariants>['color'];

  const eventBadgeClasses = cn(
    eventBadgeVariants({ color, multiDayPosition: position, className }),
  );

  return (
    <DraggableEvent event={event}>
      <EventDetailsDialog event={event}>
        <button
          type="button"
          className={cn(eventBadgeClasses, 'w-full text-left')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 truncate">
            {!['middle', 'last'].includes(position) &&
              ['mixed', 'dot'].includes(badgeVariant) && (
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

            {renderBadgeText && (
              <p className="flex-1 truncate font-semibold">
                {eventCurrentDay && (
                  <span className="text-xs">
                    Dia {eventCurrentDay} de {eventTotalDays} •{' '}
                  </span>
                )}
                {event.title}
              </p>
            )}
          </div>

          {renderBadgeText && (
            <span>{format(new Date(event.startDate), 'HH:mm')}</span>
          )}
        </button>
      </EventDetailsDialog>
    </DraggableEvent>
  );
}
