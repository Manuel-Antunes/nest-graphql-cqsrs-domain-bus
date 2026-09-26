import type { Mail } from '@nestposts/mail/mail';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import type { NotificationRecipient } from '@nestposts/notifications/domain/notification/notification-recipient';

import type { CalendarEventMailRecipient } from '../../../mail/calendar-event.mail';
import type { CalendarEvent } from '../calendar-event.entity';
import type { CalendarEventInvitationData } from '../schemas/calendar-event-invitation.schema';
import type { CalendarInvitee } from '../schemas/calendar-invitee.schema';

export interface CalendarInvitation {
  readonly event: Pick<CalendarEvent, 'id' | 'details' | 'window' | 'sequence'>;
  readonly responsible: INotifiable;
  readonly participants: readonly INotifiable[];
  readonly url: string;
  readonly issuedAt: Date;
}

export abstract class CalendarEventNotification<
    TData extends CalendarEventInvitationData,
  >
  extends Notification<TData>
  implements MailNotification
{
  override via(): readonly string[] {
    return [EMAIL_CHANNEL];
  }

  abstract toMail(recipient: NotificationRecipient): Mail;

  protected static invitationOf({
    event,
    responsible,
    participants,
    url,
    issuedAt,
  }: CalendarInvitation): CalendarEventInvitationData {
    return {
      calendarEventId: event.id.value,
      title: event.details.title.value,
      description: event.details.description?.value ?? null,
      startDate: event.window.startDate.toISOString(),
      endDate: event.window.endDate.toISOString(),
      sequence: event.sequence,
      responsible: CalendarEventNotification.inviteeOf(responsible),
      participants: participants
        .filter((participant) =>
          participant.routeNotificationFor(EMAIL_CHANNEL),
        )
        .map((participant) => CalendarEventNotification.inviteeOf(participant)),
      url,
      issuedAt: issuedAt.toISOString(),
    };
  }

  protected static addressOf(
    recipient: NotificationRecipient,
  ): CalendarEventMailRecipient {
    return {
      address: recipient.routeNotificationFor(EMAIL_CHANNEL) ?? '',
      name: recipient.notifiableName,
    };
  }

  private static inviteeOf(notifiable: INotifiable): CalendarInvitee {
    return {
      name: notifiable.notifiableName,
      email: notifiable.routeNotificationFor(EMAIL_CHANNEL) ?? '',
    };
  }
}
