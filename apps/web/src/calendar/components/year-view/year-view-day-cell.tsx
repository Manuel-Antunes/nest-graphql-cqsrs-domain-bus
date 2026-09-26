import { useRouter } from 'next/navigation';
import { cn } from '@nestposts/ui/lib/utils';
import { isToday } from 'date-fns';

import { useCalendar } from '@/calendar/contexts/calendar-context';
import { toDateParam } from '@/calendar/helpers';
import type { IEvent } from '@/calendar/interfaces';

interface IProps {
  day: number;
  date: Date;
  events: IEvent[];
}

export function YearViewDayCell({ day, date, events }: IProps) {
  const { push } = useRouter();
  const { basePath } = useCalendar();

  const maxIndicators = 3;
  const eventCount = events.length;

  const handleClick = () => {
    push(`${basePath}/day-view?date=${toDateParam(date)}`);
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      className="flex h-11 flex-1 cursor-pointer flex-col items-center justify-start gap-0.5 rounded-md pt-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div
        className={cn(
          'flex size-6 items-center justify-center rounded-full font-medium text-xs',
          isToday(date) && 'bg-primary font-semibold text-primary-foreground',
        )}
      >
        {day}
      </div>

      {eventCount > 0 && (
        <div className="mt-0.5 flex gap-0.5">
          {eventCount <= maxIndicators ? (
            events.map((event) => (
              <div
                key={event.id}
                className={cn(
                  'size-1.5 rounded-full',
                  event.color === 'blue' && 'bg-primary',
                  event.color === 'green' && 'bg-green-600',
                  event.color === 'red' && 'bg-red-600',
                  event.color === 'yellow' && 'bg-yellow-600',
                  event.color === 'purple' && 'bg-purple-600',
                  event.color === 'orange' && 'bg-orange-600',
                  event.color === 'gray' && 'bg-neutral-600',
                )}
              />
            ))
          ) : (
            <>
              <div
                className={cn(
                  'size-1.5 rounded-full',
                  events[0].color === 'blue' && 'bg-primary',
                  events[0].color === 'green' && 'bg-green-600',
                  events[0].color === 'red' && 'bg-red-600',
                  events[0].color === 'yellow' && 'bg-yellow-600',
                  events[0].color === 'purple' && 'bg-purple-600',
                  events[0].color === 'orange' && 'bg-orange-600',
                )}
              />
              <span className="text-[7px] text-muted-foreground">
                +{eventCount - 1}
              </span>
            </>
          )}
        </div>
      )}
    </button>
  );
}
