import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import { NotificationDeliveryRepository } from '../domain/delivery/notification-delivery.repository';
import { DeviceRepository } from '../domain/device/device.repository';
import { NotificationRecordRepository } from '../domain/notification/notification-record.repository';
import { DeviceEntitySchema } from './persistence/entities/device-orm.entity';
import { NotificationDeliveryEntitySchema } from './persistence/entities/notification-delivery-orm.entity';
import { NotificationRecordEntitySchema } from './persistence/entities/notification-record-orm.entity';
import { MikroOrmDeviceRepository } from './persistence/repositories/mikro-orm-device.repository';
import { MikroOrmNotificationDeliveryRepository } from './persistence/repositories/mikro-orm-notification-delivery.repository';
import { MikroOrmNotificationRecordRepository } from './persistence/repositories/mikro-orm-notification-record.repository';

export const notificationsEntities = [
  NotificationRecordEntitySchema,
  NotificationDeliveryEntitySchema,
  DeviceEntitySchema,
];

@Module({
  imports: [DatabaseModule.forFeature(notificationsEntities)],
  providers: [
    {
      provide: NotificationRecordRepository,
      useClass: MikroOrmNotificationRecordRepository,
    },
    {
      provide: NotificationDeliveryRepository,
      useClass: MikroOrmNotificationDeliveryRepository,
    },
    { provide: DeviceRepository, useClass: MikroOrmDeviceRepository },
  ],
  exports: [
    NotificationRecordRepository,
    NotificationDeliveryRepository,
    DeviceRepository,
  ],
})
export class NotificationsInfrastructureModule {}
