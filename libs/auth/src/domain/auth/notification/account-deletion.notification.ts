import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { AccountDeletionMail } from '../../../mail/account-deletion.mail';
import { mailRecipientOf } from '../../../mail/mail-recipient';
import type { AuthLinkNotificationData } from '../schemas/auth-link-notification.schema';
import { AuthLinkNotificationSchema } from '../schemas/auth-link-notification.schema';

export const ACCOUNT_DELETION_NOTIFICATION = 'auth.AccountDeletion';

@NotificationType(ACCOUNT_DELETION_NOTIFICATION)
export class AccountDeletionNotification
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

  toMail(recipient: INotifiable): AccountDeletionMail {
    return new AccountDeletionMail(this.data, mailRecipientOf(recipient));
  }
}
