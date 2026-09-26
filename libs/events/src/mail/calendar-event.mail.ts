import { Mail } from '@nestposts/mail/mail';
import type { ICalCalendar, ICalOrganizer } from 'ical-generator';
import { ICalAttendeeRole, ICalAttendeeStatus } from 'ical-generator';

import type { CalendarEventInvitationData } from '../domain/calendar-event/schemas/calendar-event-invitation.schema';

export interface CalendarEventMailRecipient {
  address: string;
  name: string | null;
}

export const CALENDAR_UID_DOMAIN = 'nestposts';

export abstract class CalendarEventMail<
  TData extends CalendarEventInvitationData,
> extends Mail {
  private static readonly period = new Intl.DateTimeFormat('en', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  constructor(
    protected readonly invitation: TData,
    protected readonly recipient: CalendarEventMailRecipient,
  ) {
    super();
  }

  protected invite(calendar: ICalCalendar): void {
    const { invitation } = this;
    calendar.prodId({ company: 'Nest Posts', product: 'Calendar' });
    calendar.createEvent({
      id: `${invitation.calendarEventId}@${CALENDAR_UID_DOMAIN}`,
      sequence: invitation.sequence,
      stamp: new Date(invitation.issuedAt),
      start: new Date(invitation.startDate),
      end: new Date(invitation.endDate),
      summary: invitation.title,
      description: invitation.description,
      url: invitation.url,
      organizer: this.organizer(),
      attendees: [
        {
          name: invitation.responsible.name,
          email: invitation.responsible.email,
          role: ICalAttendeeRole.CHAIR,
          status: ICalAttendeeStatus.ACCEPTED,
        },
        ...invitation.participants.map((participant) => ({
          name: participant.name,
          email: participant.email,
          role: ICalAttendeeRole.REQ,
          status: ICalAttendeeStatus.NEEDSACTION,
          rsvp: true,
        })),
      ],
    });
  }

  private organizer(): ICalOrganizer | string {
    const { from } = this.message.toObject().message;
    if (typeof from === 'string') {
      return from;
    }
    if (from) {
      return { name: from.name || from.address, email: from.address };
    }
    const { responsible } = this.invitation;
    return {
      name: responsible.name ?? responsible.email,
      email: responsible.email,
    };
  }

  protected static when(startDate: string, endDate: string): string {
    return `${CalendarEventMail.period.formatRange(new Date(startDate), new Date(endDate))} (UTC)`;
  }
}
