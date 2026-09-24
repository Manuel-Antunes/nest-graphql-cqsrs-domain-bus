import { defineEntity, p, TENANT_SCHEMA } from '@nestposts/database';

import { NotificationDelivery } from '../../../domain/delivery/notification-delivery';

export const NotificationDeliveryEntitySchema = defineEntity({
  class: NotificationDelivery,
  tableName: 'notification_deliveries',
  schema: TENANT_SCHEMA,
  properties: {
    notificationId: p.string().length(36).primary(),
    channel: p.string().primary(),
    deliveredAt: p.datetime(),
  },
});
