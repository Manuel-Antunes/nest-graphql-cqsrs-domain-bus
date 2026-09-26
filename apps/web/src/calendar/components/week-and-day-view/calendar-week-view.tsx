import { useRouter } from 'next/navigation';
import { ScrollArea } from '@nestposts/ui/components/ui/scroll-area';
import { cn } from '@nestposts/ui/lib/utils';
import {
  addDays,
  areIntervalsOverlapping,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { AddEventDialog } from '@/calendar/components/dialogs/add-event-dialog';
import { DroppableTimeBlock } from '@/calendar/components/dnd/droppable-time-block';
import { CalendarTimeline } from '@/calendar/components/week-and-day-view/calendar-time-line';
import { EventBlock } from '@/calendar/components/week-and-day-view/event-block';
import { WeekViewMultiDayEventsRow } from '@/calendar/components/week-and-day-view/week-view-multi-day-events-row';
import { useCalendar } from '@/calendar/contexts/calendar-context';
import {
  getEventBlockStyle,
  getVisibleHours,
  groupEvents,
  isWorkingHour,
  toDateParam,
} from '@/calendar/helpers';
import type { IEvent } from '@/calendar/interfaces';

interface IProps {
  singleDayEvents: IEvent[];
  multiDayEvents: IEvent[];
}

export function CalendarWeekView({ singleDayEvents, multiDayEvents }: IProps) {
  const { selectedDate, workingHours, visibleHours, basePath } = useCalendar();
  const { push } = useRouter();

  const { hours, earliestEventHour, latestEventHour } = getVisibleHours(
    visibleHours,
    singleDayEvents,
  );

  const weekStart = startOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <>
      <div className="flex flex-col items-center justify-center border-b py-4 text-muted-foreground text-sm sm:hidden">
        <p>A visão semanal não está disponível em telas menores.</p>
        <p>Use a visão diária ou mensal.</p>
      </div>

      <div className="hidden flex-col sm:flex">
        <div>
          <WeekViewMultiDayEventsRow
            selectedDate={selectedDate}
            multiDayEvents={multiDayEvents}
          />

          <div className="relative z-20 flex border-b">
            <div className="w-18"></div>
            <div className="grid flex-1 grid-cols-7 divide-x border-l">
              {weekDays.map((day) => (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() =>
                    push(`${basePath}/day-view?date=${toDateParam(day)}`)
                  }
                  className="cursor-pointer py-2 text-center font-medium text-muted-foreground text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {format(day, 'EEE', { locale: ptBR })}{' '}
                  <span className="ml-1 font-semibold text-foreground">
                    {format(day, 'd')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <ScrollArea className="h-[736px]">
          <div className="flex overflow-hidden">
            <div className="relative w-18">
              {hours.map((hour, index) => (
                <div key={hour} className="relative" style={{ height: '96px' }}>
                  <div className="absolute -top-3 right-2 flex h-6 items-center">
                    {index !== 0 && (
                      <span className="text-muted-foreground text-xs">
                        {format(new Date().setHours(hour, 0, 0, 0), "HH'h'")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative flex-1 border-l">
              <div className="grid grid-cols-7 divide-x">
                {weekDays.map((day) => {
                  const dayEvents = singleDayEvents.filter(
                    (event) =>
                      isSameDay(parseISO(event.startDate), day) ||
                      isSameDay(parseISO(event.endDate), day),
                  );
                  const groupedEvents = groupEvents(dayEvents);

                  return (
                    <div key={day.toISOString()} className="relative">
                      {hours.map((hour, index) => {
                        const isDisabled = !isWorkingHour(
                          day,
                          hour,
                          workingHours,
                        );

                        return (
                          <div
                            key={hour}
                            className={cn(
                              'relative',
                              isDisabled && 'bg-calendar-disabled-hour',
                            )}
                            style={{ height: '96px' }}
                          >
                            {index !== 0 && (
                              <div className="pointer-events-none absolute inset-x-0 top-0 border-b"></div>
                            )}

                            <DroppableTimeBlock
                              date={day}
                              hour={hour}
                              minute={0}
                            >
                              <AddEventDialog
                                startDate={day}
                                startTime={{ hour, minute: 0 }}
                              >
                                <div className="absolute inset-x-0 top-0 h-[24px] cursor-pointer transition-colors hover:bg-accent" />
                              </AddEventDialog>
                            </DroppableTimeBlock>

                            <DroppableTimeBlock
                              date={day}
                              hour={hour}
                              minute={15}
                            >
                              <AddEventDialog
                                startDate={day}
                                startTime={{ hour, minute: 15 }}
                              >
                                <div className="absolute inset-x-0 top-[24px] h-[24px] cursor-pointer transition-colors hover:bg-accent" />
                              </AddEventDialog>
                            </DroppableTimeBlock>

                            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-b border-dashed"></div>

                            <DroppableTimeBlock
                              date={day}
                              hour={hour}
                              minute={30}
                            >
                              <AddEventDialog
                                startDate={day}
                                startTime={{ hour, minute: 30 }}
                              >
                                <div className="absolute inset-x-0 top-[48px] h-[24px] cursor-pointer transition-colors hover:bg-accent" />
                              </AddEventDialog>
                            </DroppableTimeBlock>

                            <DroppableTimeBlock
                              date={day}
                              hour={hour}
                              minute={45}
                            >
                              <AddEventDialog
                                startDate={day}
                                startTime={{ hour, minute: 45 }}
                              >
                                <div className="absolute inset-x-0 top-[72px] h-[24px] cursor-pointer transition-colors hover:bg-accent" />
                              </AddEventDialog>
                            </DroppableTimeBlock>
                          </div>
                        );
                      })}

                      {groupedEvents.map((group, groupIndex) =>
                        group.map((event) => {
                          let style = getEventBlockStyle(
                            event,
                            day,
                            groupIndex,
                            groupedEvents.length,
                            { from: earliestEventHour, to: latestEventHour },
                          );
                          const hasOverlap = groupedEvents.some(
                            (otherGroup, otherIndex) =>
                              otherIndex !== groupIndex &&
                              otherGroup.some((otherEvent) =>
                                areIntervalsOverlapping(
                                  {
                                    start: parseISO(event.startDate),
                                    end: parseISO(event.endDate),
                                  },
                                  {
                                    start: parseISO(otherEvent.startDate),
                                    end: parseISO(otherEvent.endDate),
                                  },
                                ),
                              ),
                          );

                          if (!hasOverlap)
                            style = { ...style, width: '100%', left: '0%' };

                          return (
                            <div
                              key={event.id}
                              className="absolute p-1"
                              style={style}
                            >
                              <EventBlock event={event} />
                            </div>
                          );
                        }),
                      )}
                    </div>
                  );
                })}
              </div>

              <CalendarTimeline
                firstVisibleHour={earliestEventHour}
                lastVisibleHour={latestEventHour}
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
