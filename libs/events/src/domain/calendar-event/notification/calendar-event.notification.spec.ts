import { ReactEmailTemplateResolver } from '@nestposts/mail/react-email-template.resolver';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationRecipient } from '@nestposts/notifications/domain/notification/notification-recipient';

import type { CalendarEventInvitationData } from '../schemas/calendar-event-invitation.schema';
import { CalendarEventDetails } from '../vo/calendar-event-details';
import { CalendarEventId } from '../vo/calendar-event-id';
import { CalendarEventWindow } from '../vo/calendar-event-window';
import type {
  CalendarEventNotification,
  CalendarInvitation,
} from './calendar-event.notification';
import { CalendarEventRescheduledNotification } from './calendar-event-rescheduled.notification';
import { CalendarEventScheduledNotification } from './calendar-event-scheduled.notification';

const person = (name: string, email: string): INotifiable => ({
  notifiableType: 'users.User',
  notifiableId: email,
  notifiableName: name,
  routeNotificationFor: (channel) =>
    channel === EMAIL_CHANNEL ? email : undefined,
});

const ana = person('Ana', 'ana@example.com');
const rui = person('Rui', 'rui@example.com');

const id = CalendarEventId.parse('6b1f3d2a-8c4e-4f5a-9b7d-1e2c3a4b5c6d');
const planned = CalendarEventWindow.between(
  new Date('2026-10-01T14:00:00.000Z'),
  new Date('2026-10-01T15:00:00.000Z'),
);
const moved = CalendarEventWindow.between(
  new Date('2026-10-02T16:00:00.000Z'),
  new Date('2026-10-02T17:30:00.000Z'),
);

const invitation = (
  window: CalendarEventWindow,
  sequence: number,
): CalendarInvitation => ({
  event: {
    id,
    details: CalendarEventDetails.parse({
      title: 'Planning',
      description: 'Sprint planning',
      color: 'green',
    }),
    window,
    sequence,
  },
  responsible: ana,
  participants: [rui],
  url: 'https://web.test/events',
  issuedAt: new Date('2026-09-26T12:00:00.000Z'),
});

const unfolded = (ics: string | undefined) =>
  (ics ?? '').replace(/\r\n[ \t]/g, '');

const sender = { address: 'no-reply@nestposts.test', name: 'Nest Posts' };

const sentTo = async (
  notification: CalendarEventNotification<CalendarEventInvitationData>,
  notifiable: INotifiable,
  { withSender = true }: { withSender?: boolean } = {},
) => {
  const mail = notification.toMail(
    NotificationRecipient.of(notifiable, [EMAIL_CHANNEL]),
  );
  if (withSender) mail.message.from(sender.address, sender.name);
  const { message } = (
    await mail.buildWithContents(new ReactEmailTemplateResolver())
  ).toObject();
  return { ...message, ics: unfolded(message.icalEvent?.content) };
};

describe('calendar event notifications', () => {
  it('invites by email only, once per event', () => {
    const scheduled = new CalendarEventScheduledNotification(
      invitation(planned, 0),
    );

    expect(scheduled.channelsFor(rui)).toEqual([EMAIL_CHANNEL]);
    expect(scheduled.key).toBe(id.value);
  });

  it('mails an invitation the calendar can add: REQUEST, the sender organizing, everyone attending, the event’s UID', async () => {
    const mail = await sentTo(
      new CalendarEventScheduledNotification(invitation(planned, 0)),
      rui,
    );

    expect(mail.to).toEqual([{ address: 'rui@example.com', name: 'Rui' }]);
    expect(mail.subject).toBe('Invitation: Planning');
    expect(mail.html).toContain('Sprint planning');
    expect(mail.html).toContain('Thursday, October 1, 2026');
    expect(mail.text).toContain('PLANNING');
    expect(mail.icalEvent).toMatchObject({
      method: 'REQUEST',
      filename: 'invite.ics',
    });
    expect(mail.ics).toContain('METHOD:REQUEST');
    expect(mail.ics).toContain(`UID:${id.value}@nestposts`);
    expect(mail.ics).toContain('SEQUENCE:0');
    expect(mail.ics).toContain('DTSTART:20261001T140000Z');
    expect(mail.ics).toContain('DTEND:20261001T150000Z');
    expect(mail.ics).toContain('DTSTAMP:20260926T120000Z');
    expect(mail.ics).toMatch(
      /ORGANIZER;CN="?Nest Posts"?:mailto:no-reply@nestposts.test/,
    );
    expect(mail.ics).toMatch(
      /ATTENDEE;ROLE=CHAIR;PARTSTAT=ACCEPTED;[^\r\n]*ana@example.com/,
    );
    expect(mail.ics).toMatch(
      /ATTENDEE;ROLE=REQ-PARTICIPANT;[^\r\n]*RSVP=TRUE[^\r\n]*rui@example.com/,
    );
  });

  it('invites the responsible as an attendee of their own event, never as its organizer', async () => {
    const mail = await sentTo(
      new CalendarEventScheduledNotification(invitation(planned, 0)),
      ana,
    );

    expect(mail.to).toEqual([{ address: 'ana@example.com', name: 'Ana' }]);
    expect(mail.ics).not.toMatch(/ORGANIZER[^\r\n]*ana@example.com/);
    expect(mail.ics).toMatch(/ATTENDEE;ROLE=CHAIR[^\r\n]*ana@example.com/);
  });

  it('is organized by the responsible when no sender is known', async () => {
    const mail = await sentTo(
      new CalendarEventScheduledNotification(invitation(planned, 0)),
      rui,
      { withSender: false },
    );

    expect(mail.ics).toMatch(/ORGANIZER;CN="?Ana"?:mailto:ana@example.com/);
  });

  it('mails a reschedule as the same event, one revision later', async () => {
    const rescheduled = new CalendarEventRescheduledNotification(
      invitation(moved, 1),
      planned,
    );

    const mail = await sentTo(rescheduled, rui);

    expect(rescheduled.key).toBe(`${id.value}#1`);
    expect(mail.subject).toBe('Rescheduled: Planning');
    expect(mail.html).toContain('Friday, October 2, 2026');
    expect(mail.html).toContain('Thursday, October 1, 2026');
    expect(mail.ics).toContain(`UID:${id.value}@nestposts`);
    expect(mail.ics).toContain('SEQUENCE:1');
    expect(mail.ics).toContain('DTSTART:20261002T160000Z');
    expect(mail.ics).toContain('DTEND:20261002T173000Z');
  });

  it('is rebuilt from its record on the side that delivers it, and mails the same invitation', async () => {
    const sent = new CalendarEventRescheduledNotification(
      invitation(moved, 1),
      planned,
    );

    const restored = Notification.restore(sent.record);

    expect(restored).toBeInstanceOf(CalendarEventRescheduledNotification);
    expect(
      (await sentTo(restored as CalendarEventRescheduledNotification, rui)).ics,
    ).toBe((await sentTo(sent, rui)).ics);
  });
});
