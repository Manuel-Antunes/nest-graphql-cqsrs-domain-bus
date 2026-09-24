import { defineEntity, p } from '@nestposts/database';

import { NotificationDelivery } from '../../../domain/delivery/notification-delivery';

export const NotificationDeliveryEntitySchema = defineEntity({
  class: NotificationDelivery,
  tableName: 'notification_deliveries',
  properties: {
    notificationId: p.string().length(36).primary(),
    channel: p.string().primary(),
    deliveredAt: p.datetime(),
  },
});
