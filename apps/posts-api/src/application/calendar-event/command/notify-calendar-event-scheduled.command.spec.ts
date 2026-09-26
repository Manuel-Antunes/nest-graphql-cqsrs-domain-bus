import { AsyncContext, CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { CALENDAR_EVENT_SCHEDULED_NOTIFICATION } from '@nestposts/events/domain/calendar-event/notification/calendar-event-scheduled.notification';
import { CalendarEventDetails } from '@nestposts/events/domain/calendar-event/vo/calendar-event-details';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { TENANT } from '../../../../test/support/calendar-fixtures';
import {
  createCqrsTestingModule,
  inRequestContext,
  RecordingEvents,
} from '../../../../test/support/cqrs-testing-module';
import { givenAUser } from '../../../../test/support/post-fixtures';
import { WebLinks } from '../../shared/web-links';
import { CalendarEventRequest } from '../calendar-event-request';
import { NotifyCalendarEventScheduledCommand } from './notify-calendar-event-scheduled.command';

describe('NotifyCalendarEventScheduledCommand.Handler', () => {
  let module: TestingModule;
  let events: RecordingEvents;
  let ana: User;
  let rui: User;

  const calendarEventId = CalendarEventId.generate();
  const scheduledAt = new Date('2026-09-26T12:00:00.000Z');

  const scheduled = (
    responsibleId: UserId,
    participantIds: readonly UserId[],
  ) =>
    new NotifyCalendarEventScheduledCommand.NotifyCalendarEventScheduled(
      calendarEventId,
      CalendarEventDetails.parse({
        title: 'Planning',
        description: 'Sprint planning',
        color: 'green',
      }),
      CalendarEventWindow.between(
        new Date('2026-10-01T14:00:00.000Z'),
        new Date('2026-10-01T15:00:00.000Z'),
      ),
      responsibleId,
      participantIds,
      scheduledAt,
    );

  const execute = (
    command: NotifyCalendarEventScheduledCommand.NotifyCalendarEventScheduled,
  ) =>
    inRequestContext(module, () =>
      module
        .get(CommandBus)
        .execute(command, new CalendarEventRequest(calendarEventId, TENANT)),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([
      NotifyCalendarEventScheduledCommand.Handler,
      {
        provide: WebLinks,
        useValue: new WebLinks('https://web.nestposts.test'),
      },
    ]);
    ana = await givenAUser(module, 'ana@example.com', 'Ana');
    rui = await givenAUser(module, 'rui@example.com', 'Rui');
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('invites the responsible and every participant, by email, to the same event', async () => {
    await execute(scheduled(ana.id, [rui.id]));

    const invitations = events.ofType(NotificationReceivedEvent);
    expect(invitations.map((sent) => sent.notifiableId)).toEqual([
      ana.id.value,
      rui.id.value,
    ]);
    expect(invitations[0]).toEqual(
      expect.objectContaining({
        notificationType: CALENDAR_EVENT_SCHEDULED_NOTIFICATION,
        channels: ['email'],
        data: {
          calendarEventId: calendarEventId.value,
          title: 'Planning',
          description: 'Sprint planning',
          startDate: '2026-10-01T14:00:00.000Z',
          endDate: '2026-10-01T15:00:00.000Z',
          sequence: 0,
          responsible: { name: 'Ana', email: 'ana@example.com' },
          participants: [{ name: 'Rui', email: 'rui@example.com' }],
          url: 'https://web.nestposts.test/events',
          issuedAt: '2026-09-26T12:00:00.000Z',
        },
      }),
    );
    expect(invitations[1].data).toEqual(invitations[0].data);
    expect(AsyncContext.of(invitations[0])).toEqual(
      expect.objectContaining({ tenantId: TENANT }),
    );
  });

  it('names each invitation after the event and its attendee, so inviting twice is inviting once', async () => {
    await execute(scheduled(ana.id, [rui.id]));
    await execute(scheduled(ana.id, [rui.id]));

    const ids = events
      .ofType(NotificationReceivedEvent)
      .map((sent) => sent.notificationId);
    expect(new Set(ids).size).toBe(2);
  });

  it('leaves out a participant who is gone, and invites nobody when the responsible is', async () => {
    await execute(scheduled(ana.id, [UserId.generate()]));
    expect(
      events.ofType(NotificationReceivedEvent).map((sent) => sent.data),
    ).toEqual([expect.objectContaining({ participants: [] })]);

    await execute(scheduled(UserId.generate(), [rui.id]));
    expect(events.ofType(NotificationReceivedEvent)).toHaveLength(1);
  });
});
