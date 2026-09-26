import type { CalendarEventRescheduleData } from '../domain/calendar-event/schemas/calendar-event-invitation.schema';
import { CalendarEventMail } from './calendar-event.mail';
import type { CalendarEventRescheduledEmailProps } from './templates/calendar-event-rescheduled.email';
import { CalendarEventRescheduledEmail } from './templates/calendar-event-rescheduled.email';

export class CalendarEventRescheduledMail extends CalendarEventMail<CalendarEventRescheduleData> {
  prepare(): void {
    const props: CalendarEventRescheduledEmailProps = {
      name: this.recipient.name,
      title: this.invitation.title,
      when: CalendarEventMail.when(
        this.invitation.startDate,
        this.invitation.endDate,
      ),
      previously: CalendarEventMail.when(
        this.invitation.previousStartDate,
        this.invitation.previousEndDate,
      ),
      url: this.invitation.url,
    };
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .subject(`Rescheduled: ${this.invitation.title}`)
      .htmlView(CalendarEventRescheduledEmail, props)
      .textView(CalendarEventRescheduledEmail.text, props)
      .icalEvent((calendar) => this.invite(calendar), {
        method: 'REQUEST',
        filename: 'invite.ics',
      });
  }
}
