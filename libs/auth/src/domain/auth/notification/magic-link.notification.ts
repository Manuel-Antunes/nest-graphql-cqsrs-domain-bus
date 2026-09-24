import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { MagicLinkMail } from '../../../mail/magic-link.mail';
import { mailRecipientOf } from '../../../mail/mail-recipient';
import type { AuthLinkNotificationData } from '../schemas/auth-link-notification.schema';
import { AuthLinkNotificationSchema } from '../schemas/auth-link-notification.schema';

export const MAGIC_LINK_NOTIFICATION = 'auth.MagicLink';

@NotificationType(MAGIC_LINK_NOTIFICATION)
export class MagicLinkNotification
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

  toMail(recipient: INotifiable): MagicLinkMail {
    return new MagicLinkMail(this.data, mailRecipientOf(recipient));
  }
}
