import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { mailRecipientOf } from '../../../mail/mail-recipient';
import { OneTimePasswordMail } from '../../../mail/one-time-password.mail';
import type { OneTimePasswordNotificationData } from '../schemas/one-time-password-notification.schema';
import { OneTimePasswordNotificationSchema } from '../schemas/one-time-password-notification.schema';

export const ONE_TIME_PASSWORD_NOTIFICATION = 'auth.OneTimePassword';

@NotificationType(ONE_TIME_PASSWORD_NOTIFICATION)
export class OneTimePasswordNotification
  extends Notification<OneTimePasswordNotificationData>
  implements MailNotification
{
  static override readonly schema = OneTimePasswordNotificationSchema;

  constructor(password: OneTimePasswordNotificationData) {
    super(password);
  }

  override via(): readonly string[] {
    return [EMAIL_CHANNEL];
  }

  toMail(recipient: INotifiable): OneTimePasswordMail {
    return new OneTimePasswordMail(this.data, mailRecipientOf(recipient));
  }
}
