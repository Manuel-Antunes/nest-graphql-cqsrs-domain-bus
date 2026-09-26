import { AsyncContext } from '@nestjs/cqrs';
import { TENANT_HEADER } from '@nestposts/database';
import { CalendarEventCreatedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-created.event';
import { CalendarEventDeletedEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-deleted.event';
import { CalendarEventRescheduledEvent } from '@nestposts/events/domain/calendar-event/event/calendar-event-rescheduled.event';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { firstValueFrom, of, toArray } from 'rxjs';

import { CalendarEventRequest } from '../calendar-event-request';
import { NotifyCalendarEventRescheduledCommand } from '../command/notify-calendar-event-rescheduled.command';
import { NotifyCalendarEventScheduledCommand } from '../command/notify-calendar-event-scheduled.command';
import { NotifyAttendeesOnCalendarEvent } from './notify-attendees-on-calendar-event.saga';

const calendarEventId = CalendarEventId.generate();
const responsibleId = UserId.generate();
const participantId = UserId.generate();
const now = new Date('2026-09-26T12:00:00.000Z');
const start = new Date('2026-10-01T14:00:00.000Z');
const end = new Date('2026-10-01T15:00:00.000Z');

const requested = <T extends object>(event: T): CalendarEventRequest => {
  const request = new CalendarEventRequest(calendarEventId, 'acme');
  request.attachTo(event);
  return request;
};

describe('NotifyAttendeesOnCalendarEvent', () => {
  it('asks to invite everyone on a new event, from what the event carried, with its request', async () => {
    const created = new CalendarEventCreatedEvent(
      calendarEventId.value,
      'Planning',
      'Sprint planning',
      start,
      end,
      'green',
      responsibleId.value,
      [participantId.value],
      null,
      now,
    );
    const request = requested(created);

    const commands = await firstValueFrom(
      new NotifyAttendeesOnCalendarEvent()
        .inviteTheAttendees(of(created))
        .pipe(toArray()),
    );
    const [command] =
      commands as NotifyCalendarEventScheduledCommand.NotifyCalendarEventScheduled[];

    expect(command).toBeInstanceOf(
      NotifyCalendarEventScheduledCommand.NotifyCalendarEventScheduled,
    );
    expect(command.calendarEventId.equals(calendarEventId)).toBe(true);
    expect(command.details.title.value).toBe('Planning');
    expect(command.window.startDate).toEqual(start);
    expect(command.responsibleId.equals(responsibleId)).toBe(true);
    expect(command.participantIds.map((id) => id.value)).toEqual([
      participantId.value,
    ]);
    expect(command.scheduledAt).toEqual(now);
    expect(AsyncContext.of(command)).toBe(request);
  });

  it('asks to update their calendars when the event moves, with its revision', async () => {
    const moved = new Date('2026-10-02T14:00:00.000Z');
    const rescheduled = new CalendarEventRescheduledEvent(
      calendarEventId.value,
      moved,
      new Date('2026-10-02T15:00:00.000Z'),
      start,
      end,
      3,
      now,
    );
    const request = requested(rescheduled);

    const commands = await firstValueFrom(
      new NotifyAttendeesOnCalendarEvent()
        .updateTheirCalendars(of(rescheduled))
        .pipe(toArray()),
    );
    const [command] =
      commands as NotifyCalendarEventRescheduledCommand.NotifyCalendarEventRescheduled[];

    expect(command.window.startDate).toEqual(moved);
    expect(command.previous.startDate).toEqual(start);
    expect(command.sequence).toBe(3);
    expect(command.rescheduledAt).toEqual(now);
    expect(AsyncContext.of(command)).toBe(request);
  });

  it('ignores every other event', async () => {
    const saga = new NotifyAttendeesOnCalendarEvent();
    const deleted = new CalendarEventDeletedEvent(calendarEventId.value, now);

    await expect(
      firstValueFrom(saga.inviteTheAttendees(of(deleted)).pipe(toArray())),
    ).resolves.toEqual([]);
    await expect(
      firstValueFrom(saga.updateTheirCalendars(of(deleted)).pipe(toArray())),
    ).resolves.toEqual([]);
  });

  it('carries the tenant across the wire, so the notification lands in it', () => {
    expect(
      new CalendarEventRequest(calendarEventId, 'acme').toAttributes(),
    ).toEqual({ [TENANT_HEADER]: 'acme' });
  });
});
