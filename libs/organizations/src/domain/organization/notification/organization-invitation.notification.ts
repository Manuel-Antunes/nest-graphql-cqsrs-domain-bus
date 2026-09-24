import { mailRecipientOf } from '@nestposts/auth/mail/mail-recipient';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { OrganizationInvitationMail } from '../../../mail/organization-invitation.mail';
import type { OrganizationInvitationNotificationData } from '../schemas/organization-invitation-notification.schema';
import { OrganizationInvitationNotificationSchema } from '../schemas/organization-invitation-notification.schema';

export const ORGANIZATION_INVITATION_NOTIFICATION = 'organizations.Invitation';

@NotificationType(ORGANIZATION_INVITATION_NOTIFICATION)
export class OrganizationInvitationNotification
  extends Notification<OrganizationInvitationNotificationData>
  implements MailNotification
{
  static override readonly schema = OrganizationInvitationNotificationSchema;

  constructor(invitation: OrganizationInvitationNotificationData) {
    super(invitation);
  }

  override via(): readonly string[] {
    return [EMAIL_CHANNEL];
  }

  toMail(recipient: INotifiable): OrganizationInvitationMail {
    return new OrganizationInvitationMail(
      this.data,
      mailRecipientOf(recipient),
    );
  }
}
