import type { NotificationRecipient } from '@nestposts/notifications/domain/notification/notification-recipient';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { CalendarEventScheduledMail } from '../../../mail/calendar-event-scheduled.mail';
import type { CalendarEventInvitationData } from '../schemas/calendar-event-invitation.schema';
import { CalendarEventInvitationSchema } from '../schemas/calendar-event-invitation.schema';
import type { CalendarInvitation } from './calendar-event.notification';
import { CalendarEventNotification } from './calendar-event.notification';

export const CALENDAR_EVENT_SCHEDULED_NOTIFICATION =
  'events.CalendarEventScheduled';

@NotificationType(CALENDAR_EVENT_SCHEDULED_NOTIFICATION)
export class CalendarEventScheduledNotification extends CalendarEventNotification<CalendarEventInvitationData> {
  static override readonly schema = CalendarEventInvitationSchema;

  constructor(invitation: CalendarInvitation) {
    super(CalendarEventNotification.invitationOf(invitation), {
      key: invitation.event.id.value,
    });
  }

  toMail(recipient: NotificationRecipient): CalendarEventScheduledMail {
    return new CalendarEventScheduledMail(
      this.data,
      CalendarEventNotification.addressOf(recipient),
    );
  }
}
