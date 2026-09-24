import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { mailRecipientOf } from '../../../mail/mail-recipient';
import { PasswordResetMail } from '../../../mail/password-reset.mail';
import type { AuthLinkNotificationData } from '../schemas/auth-link-notification.schema';
import { AuthLinkNotificationSchema } from '../schemas/auth-link-notification.schema';

export const PASSWORD_RESET_NOTIFICATION = 'auth.PasswordReset';

@NotificationType(PASSWORD_RESET_NOTIFICATION)
export class PasswordResetNotification
  extends Notification<AuthLinkNotificationData>
  implements MailNotification
{
  static override readonly schema = AuthLinkNotificationSchema;

  constructor(link: AuthLinkNotificationData) {
    super(link);
  }

  override via(): readonly string[] {
    return [EMAIL_CHANNEL];
  }

  toMail(recipient: INotifiable): PasswordResetMail {
    return new PasswordResetMail(this.data, mailRecipientOf(recipient));
  }
}
