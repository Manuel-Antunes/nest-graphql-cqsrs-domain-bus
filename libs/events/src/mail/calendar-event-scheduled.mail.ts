import type { CalendarEventInvitationData } from '../domain/calendar-event/schemas/calendar-event-invitation.schema';
import { CalendarEventMail } from './calendar-event.mail';
import type { CalendarEventScheduledEmailProps } from './templates/calendar-event-scheduled.email';
import { CalendarEventScheduledEmail } from './templates/calendar-event-scheduled.email';

export class CalendarEventScheduledMail extends CalendarEventMail<CalendarEventInvitationData> {
  prepare(): void {
    const props: CalendarEventScheduledEmailProps = {
      name: this.recipient.name,
      title: this.invitation.title,
      description: this.invitation.description,
      when: CalendarEventMail.when(
        this.invitation.startDate,
        this.invitation.endDate,
      ),
      responsible:
        this.invitation.responsible.name ?? this.invitation.responsible.email,
      url: this.invitation.url,
    };
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .subject(`Invitation: ${this.invitation.title}`)
      .htmlView(CalendarEventScheduledEmail, props)
      .textView(CalendarEventScheduledEmail.text, props)
      .icalEvent((calendar) => this.invite(calendar), {
        method: 'REQUEST',
        filename: 'invite.ics',
      });
  }
}
