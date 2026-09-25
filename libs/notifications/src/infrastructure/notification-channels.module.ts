import { Module } from '@nestjs/common';

import { PushNotifications } from '../domain/channel/push-notifications';
import { DatabaseChannel } from './channels/database.channel';
import { MailChannel } from './channels/mail.channel';
import { NotificationChannels } from './channels/notification-channels';
import { PushChannel } from './channels/push.channel';
import type { NotificationChannelsOptions } from './notification-channels.module-definition';
import {
  ConfigurableNotificationChannelsModule,
  NOTIFICATION_CHANNELS_OPTIONS,
} from './notification-channels.module-definition';
import { NotificationsInfrastructureModule } from './notifications-infrastructure.module';
import { FirebasePushNotifications } from './push/firebase-push-notifications';
import { UnconfiguredPushNotifications } from './push/unconfigured-push-notifications';

/**
 * The delivering half of notifications: the `database`, `email` and `push` channels, and
 * {@link NotificationChannels} to find them by name.
 *
 * ```ts
 * NotificationChannelsModule.forRoot({
 *   notifications: [PostCreatedNotification],
 *   push: firebasePushOptionsFromEnv(process.env),
 * })
 * ```
 *
 * `email` sends through the `MailSender` a global `MailModule` binds, so the application that
 * delivers imports that too. An application that only NOTIFIES — raises the event — needs neither.
 */
@Module({
  imports: [NotificationsInfrastructureModule],
  providers: [
    DatabaseChannel,
    MailChannel,
    PushChannel,
    NotificationChannels,
    {
      provide: PushNotifications,
      inject: [NOTIFICATION_CHANNELS_OPTIONS],
      useFactory: (options: NotificationChannelsOptions) =>
        options.push
          ? FirebasePushNotifications.from(options.push)
          : new UnconfiguredPushNotifications(),
    },
  ],
  exports: [NotificationChannels, NotificationsInfrastructureModule],
})
export class NotificationChannelsModule extends ConfigurableNotificationChannelsModule {}
