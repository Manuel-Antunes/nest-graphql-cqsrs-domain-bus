import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';

export interface MailRecipient {
  address: string;
  name: string | null;
}

export const mailRecipientOf = (notifiable: INotifiable): MailRecipient => ({
  address: notifiable.routeNotificationFor(EMAIL_CHANNEL) ?? '',
  name: notifiable.notifiableName,
});
