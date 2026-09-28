import { Injectable } from '@nestjs/common';
import type { ICommand, IEvent } from '@nestjs/cqrs';
import { AsyncContext, ofType, Saga } from '@nestjs/cqrs';
import { CalendarEventCreatedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-created.event';
import { CalendarEventRescheduledEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-rescheduled.event';
import { CalendarEventDetails } from '@nestposts/events/domain/calendar-event/vo/calendar-event-details';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import { ProcessingGroup } from '@nestposts/transport-eventbus';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import { NotifyCalendarEventRescheduledCommand } from '../command/notify-calendar-event-rescheduled.command';
import { NotifyCalendarEventScheduledCommand } from '../command/notify-calendar-event-scheduled.command';

@Injectable()
@ProcessingGroup('notifications', {
  events: [CalendarEventCreatedEvent, CalendarEventRescheduledEvent],
})
export class NotifyAttendeesOnCalendarEvent {
  @Saga()
  inviteTheAttendees = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(CalendarEventCreatedEvent),
      map((event) => {
        const command =
          new NotifyCalendarEventScheduledCommand.NotifyCalendarEventScheduled(
            CalendarEventId.parse(event.calendarEventId),
            CalendarEventDetails.parse(event),
            CalendarEventWindow.between(event.startDate, event.endDate),
            UserId.parse(event.responsibleId),
            event.participantIds.map((participantId) =>
              UserId.parse(participantId),
            ),
            event.occurredAt,
          );
        AsyncContext.merge(event, command);
        return command;
      }),
    );

  @Saga()
  updateTheirCalendars = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(
      ofType(CalendarEventRescheduledEvent),
      map((event) => {
        const command =
          new NotifyCalendarEventRescheduledCommand.NotifyCalendarEventRescheduled(
            CalendarEventId.parse(event.calendarEventId),
            CalendarEventWindow.between(event.startDate, event.endDate),
            CalendarEventWindow.between(
              event.previousStartDate,
              event.previousEndDate,
            ),
            event.sequence,
            event.occurredAt,
          );
        AsyncContext.merge(event, command);
        return command;
      }),
    );
}
