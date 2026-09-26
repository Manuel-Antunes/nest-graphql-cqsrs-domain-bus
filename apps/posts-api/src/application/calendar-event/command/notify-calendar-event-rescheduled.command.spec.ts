import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { CALENDAR_EVENT_RESCHEDULED_NOTIFICATION } from '@nestposts/events/domain/calendar-event/notification/calendar-event-rescheduled.notification';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import type { User } from '@nestposts/users/domain/user/user.entity';

import {
  calendarTesting,
  givenAnEvent,
  TENANT,
} from '../../../../test/support/calendar-fixtures';
import {
  createCqrsTestingModule,
  inRequestContext,
  RecordingEvents,
} from '../../../../test/support/cqrs-testing-module';
import { givenAUser } from '../../../../test/support/post-fixtures';
import { WebLinks } from '../../shared/web-links';
import { CalendarEventRequest } from '../calendar-event-request';
import { NotifyCalendarEventRescheduledCommand } from './notify-calendar-event-rescheduled.command';

describe('NotifyCalendarEventRescheduledCommand.Handler', () => {
  let module: TestingModule;
  let events: RecordingEvents;
  let ana: User;
  let rui: User;

  const moved = CalendarEventWindow.between(
    new Date('2026-10-02T16:00:00.000Z'),
    new Date('2026-10-02T17:30:00.000Z'),
  );
  const planned = CalendarEventWindow.between(
    new Date('2026-10-01T09:00:00.000Z'),
    new Date('2026-10-01T10:00:00.000Z'),
  );
  const rescheduledAt = new Date('2026-09-26T12:30:00.000Z');

  const execute = (id: CalendarEventId, sequence: number) =>
    inRequestContext(module, () =>
      module
        .get(CommandBus)
        .execute(
          new NotifyCalendarEventRescheduledCommand.NotifyCalendarEventRescheduled(
            id,
            moved,
            planned,
            sequence,
            rescheduledAt,
          ),
          new CalendarEventRequest(id, TENANT),
        ),
    );

  beforeEach(async () => {
    const calendar = calendarTesting();
    module = await createCqrsTestingModule(
      [
        NotifyCalendarEventRescheduledCommand.Handler,
        {
          provide: WebLinks,
          useValue: new WebLinks('https://web.nestposts.test'),
        },
        ...calendar.providers,
      ],
      calendar.imports,
    );
    ana = await givenAUser(module, 'ana@example.com', 'Ana');
    rui = await givenAUser(module, 'rui@example.com', 'Rui');
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('tells everyone on the event where it moved, as the same event one revision later', async () => {
    const event = await givenAnEvent(module, ana, [rui]);

    await execute(event.id, 1);

    const updates = events.ofType(NotificationReceivedEvent);
    expect(updates.map((sent) => sent.notifiableId)).toEqual([
      ana.id.value,
      rui.id.value,
    ]);
    expect(updates[1]).toEqual(
      expect.objectContaining({
        notificationType: CALENDAR_EVENT_RESCHEDULED_NOTIFICATION,
        channels: ['email'],
        data: {
          calendarEventId: event.id.value,
          title: 'Planning',
          description: 'Sprint planning',
          startDate: '2026-10-02T16:00:00.000Z',
          endDate: '2026-10-02T17:30:00.000Z',
          previousStartDate: '2026-10-01T09:00:00.000Z',
          previousEndDate: '2026-10-01T10:00:00.000Z',
          sequence: 1,
          responsible: { name: 'Ana', email: 'ana@example.com' },
          participants: [{ name: 'Rui', email: 'rui@example.com' }],
          url: 'https://web.nestposts.test/events',
          issuedAt: '2026-09-26T12:30:00.000Z',
        },
      }),
    );
  });

  it('tells again for every move, and once for each', async () => {
    const event = await givenAnEvent(module, ana);

    await execute(event.id, 1);
    await execute(event.id, 1);
    await execute(event.id, 2);

    const ids = events
      .ofType(NotificationReceivedEvent)
      .map((sent) => sent.notificationId);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('tells nobody when the event is gone', async () => {
    await execute(CalendarEventId.generate(), 1);

    expect(events.ofType(NotificationReceivedEvent)).toEqual([]);
  });
});
