import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@nestposts/ui/lib/utils';
import { isToday, startOfDay } from 'date-fns';

import { AddEventDialog } from '@/calendar/components/dialogs/add-event-dialog';
import { DroppableDayCell } from '@/calendar/components/dnd/droppable-day-cell';
import { EventBullet } from '@/calendar/components/month-view/event-bullet';
import { MonthEventBadge } from '@/calendar/components/month-view/month-event-badge';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import { getMonthCellEvents, toDateParam } from '@/calendar/helpers';
import type { ICalendarCell, IEvent } from '@/calendar/interfaces';

interface IProps {
  cell: ICalendarCell;
  events: IEvent[];
  eventPositions: Record<string, number>;
}

const MAX_VISIBLE_EVENTS = 3;

export function DayCell({ cell, events, eventPositions }: IProps) {
  const { push } = useRouter();
  const { basePath } = useCalendar();

  const { day, currentMonth, date } = cell;

  const cellEvents = useMemo(
    () => getMonthCellEvents(date, events, eventPositions),
    [date, events, eventPositions],
  );
  const isSunday = date.getDay() === 0;

  const handleClick = () => {
    push(`${basePath}/day-view?date=${toDateParam(date)}`);
  };

  return (
    <DroppableDayCell cell={cell}>
      <AddEventDialog>
        <div
          className={cn(
            'flex h-full cursor-pointer flex-col gap-1 border-t border-l py-1.5 lg:pt-1 lg:pb-2',
            isSunday && 'border-l-0',
          )}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            className={cn(
              'flex size-6 translate-x-1 cursor-pointer items-center justify-center rounded-full font-semibold text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:px-2',
              !currentMonth && 'opacity-20',
              isToday(date) &&
                'bg-primary font-bold text-primary-foreground hover:bg-primary',
            )}
          >
            {day}
          </button>

          <div
            className={cn(
              'flex h-6 gap-1 px-2 lg:h-[94px] lg:flex-col lg:gap-2 lg:px-0',
              !currentMonth && 'opacity-50',
            )}
          >
            {[0, 1, 2].map((position) => {
              const event = cellEvents.find((e) => e.position === position);
              const eventKey = event
                ? `event-${event.id}-${position}`
                : `empty-${position}`;

              return (
                <div key={eventKey} className="lg:flex-1">
                  {event && (
                    <>
                      <EventBullet className="lg:hidden" color={event.color} />
                      <MonthEventBadge
                        className="hidden lg:flex"
                        event={event}
                        cellDate={startOfDay(date)}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {cellEvents.length > MAX_VISIBLE_EVENTS && (
            <p
              className={cn(
                'h-4.5 px-1.5 font-semibold text-muted-foreground text-xs',
                !currentMonth && 'opacity-50',
              )}
            >
              <span className="sm:hidden">
                +{cellEvents.length - MAX_VISIBLE_EVENTS}
              </span>
              <span className="hidden sm:inline">
                {' '}
                {cellEvents.length - MAX_VISIBLE_EVENTS} mais...
              </span>
            </p>
          )}
        </div>
      </AddEventDialog>
    </DroppableDayCell>
  );
}
