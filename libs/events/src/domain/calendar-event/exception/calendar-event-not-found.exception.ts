import type { CalendarEventId } from '../vo/calendar-event-id';

export class CalendarEventNotFoundException extends Error {
  constructor(readonly calendarEventId: CalendarEventId) {
    super(`calendar event ${calendarEventId} does not exist`);
    this.name = 'CalendarEventNotFoundException';
  }
}
