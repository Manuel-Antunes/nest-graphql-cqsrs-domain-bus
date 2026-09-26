import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventRepository } from '@nestposts/events/domain/calendar-event/calendar-event.repository';
import type { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';

export namespace FindCalendarEventQuery {
  export class FindCalendarEvent extends Query<CalendarEvent | null> {
    constructor(readonly calendarEventId: CalendarEventId) {
      super();
    }
  }

  @QueryHandler(FindCalendarEvent)
  export class Handler implements IQueryHandler<FindCalendarEvent> {
    constructor(private readonly events: CalendarEventRepository) {}

    execute(query: FindCalendarEvent): Promise<CalendarEvent | null> {
      return this.events.findById(query.calendarEventId);
    }
  }
}
