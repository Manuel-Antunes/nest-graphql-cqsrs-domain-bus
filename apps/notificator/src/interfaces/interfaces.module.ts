import { Module } from '@nestjs/common';

import { ApplicationModule } from '../application/application.module';
import { IdentityNotifiablePipe } from './auth/identity-notifiable.pipe';
import { DeviceMutationResolver } from './graphql/device-mutation.resolver';
import { NotificationResolver } from './graphql/notification.resolver';
import { UserNotificationsResolver } from './graphql/user-notifications.resolver';
import { NotificationRequestsController } from './messaging/notification-requests.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [NotificationRequestsController],
  providers: [
    NotificationResolver,
    DeviceMutationResolver,
    UserNotificationsResolver,
    IdentityNotifiablePipe,
  ],
})
export class InterfacesModule {}
