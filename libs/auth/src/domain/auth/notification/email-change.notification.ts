import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { EmailChangeMail } from '../../../mail/email-change.mail';
import { mailRecipientOf } from '../../../mail/mail-recipient';
import type { EmailChangeNotificationData } from '../schemas/email-change-notification.schema';
import { EmailChangeNotificationSchema } from '../schemas/email-change-notification.schema';

export const EMAIL_CHANGE_NOTIFICATION = 'auth.EmailChange';

@NotificationType(EMAIL_CHANGE_NOTIFICATION)
export class EmailChangeNotification
  extends Notification<EmailChangeNotificationData>
  implements MailNotification
{
  static override readonly schema = EmailChangeNotificationSchema;

  constructor(change: EmailChangeNotificationData) {
    super(change);
  }

  override via(): readonly string[] {
    return [EMAIL_CHANNEL];
  }

  toMail(recipient: INotifiable): EmailChangeMail {
    return new EmailChangeMail(this.data, mailRecipientOf(recipient));
  }
}
