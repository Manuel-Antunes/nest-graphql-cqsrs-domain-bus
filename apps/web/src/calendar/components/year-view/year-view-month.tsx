import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  format,
  getDaysInMonth,
  isSameDay,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { YearViewDayCell } from '@/calendar/components/year-view/year-view-day-cell';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import { toDateParam } from '@/calendar/helpers';
import type { IEvent } from '@/calendar/interfaces';

interface IProps {
  month: Date;
  events: IEvent[];
}

export function YearViewMonth({ month, events }: IProps) {
  const { push } = useRouter();
  const { basePath } = useCalendar();

  const monthName = format(month, 'MMMM', { locale: ptBR });

  const daysInMonth = useMemo(() => {
    const totalDays = getDaysInMonth(month);
    const firstDay = startOfMonth(month).getDay();

    const days = Array.from({ length: totalDays }, (_, i) => ({
      key: `day-${i + 1}`,
      day: i + 1,
    }));
    const blanks = Array.from({ length: firstDay }, (_, i) => ({
      key: `blank-${i}`,
      day: null,
    }));

    return [...blanks, ...days];
  }, [month]);

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const handleClick = () => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    push(`${basePath}/month-view?date=${toDateParam(firstOfMonth)}`);
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={handleClick}
        className="w-full cursor-pointer rounded-t-lg border px-3 py-2 font-semibold text-sm capitalize hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {monthName}
      </button>

      <div className="flex-1 space-y-2 rounded-b-lg border border-t-0 p-3">
        <div className="grid grid-cols-7 gap-x-0.5 text-center">
          {weekDays.map((day) => (
            <div
              key={day}
              className="font-medium text-muted-foreground text-xs"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-x-0.5 gap-y-2">
          {daysInMonth.map(({ key, day }) => {
            if (day === null) return <div key={key} className="h-10" />;

            const date = new Date(month.getFullYear(), month.getMonth(), day);
            const dayEvents = events.filter(
              (event) =>
                isSameDay(parseISO(event.startDate), date) ||
                isSameDay(parseISO(event.endDate), date),
            );

            return (
              <YearViewDayCell
                key={key}
                day={day}
                date={date}
                events={dayEvents}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
