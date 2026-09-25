import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { SubscriptionChangeMail } from '../../../mail/subscription-change.mail';
import type { SubscriptionChangeNotificationData } from '../schemas/subscription-change-notification.schema';
import { SubscriptionChangeNotificationSchema } from '../schemas/subscription-change-notification.schema';
import type { SubscriptionChange } from '../subscription-listener';

export const SUBSCRIPTION_CHANGE_NOTIFICATION = 'billing.SubscriptionChange';

@NotificationType(SUBSCRIPTION_CHANGE_NOTIFICATION)
export class SubscriptionChangeNotification
  extends Notification<SubscriptionChangeNotificationData>
  implements MailNotification
{
  static override readonly schema = SubscriptionChangeNotificationSchema;

  static of(
    change: SubscriptionChange,
    url: string,
  ): SubscriptionChangeNotification {
    return new SubscriptionChangeNotification(
      {
        event: change.event,
        planName: change.planName,
        endsAt: change.endsAt?.toISOString() ?? null,
        url,
      },
      `${change.subscriptionId}:${change.event}`,
    );
  }

  private constructor(data: SubscriptionChangeNotificationData, key: string) {
    super(data, { key });
  }

  override via(): readonly string[] {
    return [EMAIL_CHANNEL];
  }

  toMail(recipient: INotifiable): SubscriptionChangeMail {
    return new SubscriptionChangeMail(this.data, {
      address: recipient.routeNotificationFor(EMAIL_CHANNEL) ?? '',
      name: recipient.notifiableName,
    });
  }
}
