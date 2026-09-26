import type { NotificationRecipient } from '@nestposts/notifications/domain/notification/notification-recipient';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { CalendarEventRescheduledMail } from '../../../mail/calendar-event-rescheduled.mail';
import type { CalendarEventRescheduleData } from '../schemas/calendar-event-invitation.schema';
import { CalendarEventRescheduleSchema } from '../schemas/calendar-event-invitation.schema';
import type { CalendarEventWindow } from '../vo/calendar-event-window';
import type { CalendarInvitation } from './calendar-event.notification';
import { CalendarEventNotification } from './calendar-event.notification';

export const CALENDAR_EVENT_RESCHEDULED_NOTIFICATION =
  'events.CalendarEventRescheduled';

@NotificationType(CALENDAR_EVENT_RESCHEDULED_NOTIFICATION)
export class CalendarEventRescheduledNotification extends CalendarEventNotification<CalendarEventRescheduleData> {
  static override readonly schema = CalendarEventRescheduleSchema;

  constructor(invitation: CalendarInvitation, previous: CalendarEventWindow) {
    super(
      {
        ...CalendarEventNotification.invitationOf(invitation),
        previousStartDate: previous.startDate.toISOString(),
        previousEndDate: previous.endDate.toISOString(),
      },
      { key: `${invitation.event.id.value}#${invitation.event.sequence}` },
    );
  }

  toMail(recipient: NotificationRecipient): CalendarEventRescheduledMail {
    return new CalendarEventRescheduledMail(
      this.data,
      CalendarEventNotification.addressOf(recipient),
    );
  }
}
