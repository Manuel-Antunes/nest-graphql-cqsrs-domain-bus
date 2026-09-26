import { useCalendar } from '@/calendar/contexts/calendar-context';
import { useEventMutations } from '@/calendar/hooks/use-event-mutations';
import type { IEvent } from '@/calendar/interfaces';

export function useUpdateEvent() {
  const { setLocalEvents } = useCalendar();
  const { updateEvent: updateEventMutation } = useEventMutations();

  const updateEvent = (event: IEvent) => {
    const newEvent: IEvent = {
      ...event,
      startDate: new Date(event.startDate).toISOString(),
      endDate: new Date(event.endDate).toISOString(),
    };

    setLocalEvents((prev) => {
      const index = prev.findIndex((e) => e.id === event.id);
      if (index === -1) return prev;
      return [...prev.slice(0, index), newEvent, ...prev.slice(index + 1)];
    });

    updateEventMutation.mutate({
      input: {
        id: event.id,
        startDate: newEvent.startDate,
        endDate: newEvent.endDate,
      },
    });
  };

  return { updateEvent };
}
