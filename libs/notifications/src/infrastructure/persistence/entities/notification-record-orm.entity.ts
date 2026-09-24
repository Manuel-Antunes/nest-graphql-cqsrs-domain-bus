import { defineEntity, p, valueObjectType } from '@nestposts/database';

import type { NotificationData } from '../../../domain/notification/notification-record.entity';
import { NotificationRecord } from '../../../domain/notification/notification-record.entity';
import { NotificationId } from '../../../domain/notification/vo/notification-id';

const NotificationIdType = valueObjectType(NotificationId, {
  columnType: 'varchar(36)',
});

export const NotificationRecordEntitySchema = defineEntity({
  class: NotificationRecord,
  tableName: 'notifications',
  forceConstructor: true,
  properties: {
    id: p.type(NotificationIdType).primary(),
    type: p.string(),
    notifiableType: p.string(),
    notifiableId: p.string(),
    data: p.json<NotificationData>(),
    readAt: p.datetime().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
  },
  indexes: [{ properties: ['notifiableType', 'notifiableId', 'createdAt'] }],
});
