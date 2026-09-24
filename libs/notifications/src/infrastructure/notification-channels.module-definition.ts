import type { Type } from '@nestjs/common';
import { ConfigurableModuleBuilder } from '@nestjs/common';

import type { NotificationChannel } from '../domain/channel/notification-channel';
import type { Notification } from '../domain/notification/notification';
import { notificationTypeOf } from '../domain/notification/notification-type';
import { DatabaseChannel } from './channels/database.channel';
import { MailChannel } from './channels/mail.channel';
import { NOTIFICATION_CHANNELS } from './channels/notification-channels';
import { PushChannel } from './channels/push.channel';
import type { FirebasePushOptions } from './push/firebase.options';

/** How the channels deliver. */
export interface NotificationChannelsOptions {
  /** Firebase Cloud Messaging for `push`. Without it, push is unconfigured and sends nothing. */
  push?: FirebasePushOptions | null;
}

export interface NotificationChannelsExtras {
  /**
   * Every notification class this process delivers. The list is the registration: a notification is
   * rebuilt by its `@NotificationType`, and a class whose module was never imported is a type
   * nothing answers for.
   */
  notifications: readonly { readonly prototype: Notification }[];
  /** Channels beyond `database`, `email` and `push`. */
  channels: readonly Type<NotificationChannel>[];
}

export const {
  ConfigurableModuleClass: ConfigurableNotificationChannelsModule,
  MODULE_OPTIONS_TOKEN: NOTIFICATION_CHANNELS_OPTIONS,
  OPTIONS_TYPE: NOTIFICATION_CHANNELS_MODULE_OPTIONS,
  ASYNC_OPTIONS_TYPE: NOTIFICATION_CHANNELS_MODULE_ASYNC_OPTIONS,
} = new ConfigurableModuleBuilder<NotificationChannelsOptions>()
  .setClassMethodName('forRoot')
  .setExtras<NotificationChannelsExtras>(
    { notifications: [], channels: [] },
    (definition, extras) => {
      for (const notification of extras.notifications) {
        notificationTypeOf(notification);
      }
      return {
        ...definition,
        providers: [
          ...(definition.providers ?? []),
          ...extras.channels,
          {
            provide: NOTIFICATION_CHANNELS,
            inject: [
              DatabaseChannel,
              MailChannel,
              PushChannel,
              ...extras.channels,
            ],
            useFactory: (...channels: NotificationChannel[]) => channels,
          },
        ],
      };
    },
  )
  .build();
