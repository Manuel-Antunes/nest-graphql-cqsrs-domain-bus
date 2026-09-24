import { PrimaryKeyProp } from '@mikro-orm/core';

import type { NotificationId } from '../notification/vo/notification-id';

/**
 * One channel through which one notification was delivered. The ledger of these is what lets a
 * redelivered notification skip the channels that already succeeded — an email is not something a
 * rollback takes back.
 */
export class NotificationDelivery {
  [PrimaryKeyProp]?: ['notificationId', 'channel'];
  notificationId!: string;
  channel!: string;
  deliveredAt!: Date;

  static of(
    notificationId: NotificationId,
    channel: string,
    at: Date,
  ): NotificationDelivery {
    return Object.assign(new NotificationDelivery(), {
      notificationId: notificationId.value,
      channel,
      deliveredAt: at,
    });
  }
}
