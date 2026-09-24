import { Module } from '@nestjs/common';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { DeleteNotificationCommand } from './notification/command/delete-notification.command';
import { MarkAllNotificationsAsReadCommand } from './notification/command/mark-all-notifications-as-read.command';
import { MarkNotificationAsReadCommand } from './notification/command/mark-notification-as-read.command';
import { RegisterDeviceCommand } from './notification/command/register-device.command';
import { RemoveDeviceCommand } from './notification/command/remove-device.command';
import { CountUnreadNotificationsQuery } from './notification/query/count-unread-notifications.query';
import { FindDeviceQuery } from './notification/query/find-device.query';
import { FindNotificationQuery } from './notification/query/find-notification.query';
import { FindNotificationsQuery } from './notification/query/find-notifications.query';
import { FindReaderQuery } from './notification/query/find-reader.query';

@Module({
  imports: [NotificationsInfrastructureModule, UsersInfrastructureModule],
  providers: [
    MarkNotificationAsReadCommand.Handler,
    MarkAllNotificationsAsReadCommand.Handler,
    DeleteNotificationCommand.Handler,
    RegisterDeviceCommand.Handler,
    RemoveDeviceCommand.Handler,
    FindNotificationsQuery.Handler,
    FindNotificationQuery.Handler,
    CountUnreadNotificationsQuery.Handler,
    FindDeviceQuery.Handler,
    FindReaderQuery.Handler,
  ],
})
export class ApplicationModule {}
