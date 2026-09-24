import { Module } from '@nestjs/common';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { MailModule } from '@nestposts/mail/mail.module';
import { plainTextFromHtml } from '@nestposts/mail/plain-text.plugin';
import { ReactEmailTemplateResolver } from '@nestposts/mail/react-email-template.resolver';
import { NotificationChannelsModule } from '@nestposts/notifications/infrastructure/notification-channels.module';
import { firebasePushOptionsFromEnv } from '@nestposts/notifications/infrastructure/push/firebase.options';
import { loggingModule } from '@nestposts/observability';
import { PostCreatedNotification } from '@nestposts/posts/domain/post/notification/post-created.notification';
import { RetryPolicyModule } from '@nestposts/retry-policy/retry-policy.module';
import {
  MikroOrmMessageInbox,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportTenantResolver,
} from '@nestposts/transport-eventbus';

import { SendNotificationCommand } from './application/send-notification.command';
import { SendOnNotificationReceived } from './application/send-on-notification-received.saga';
import { mailSettingsFromEnv } from './infrastructure/mail/mail.config';
import { mikroOrmConfig } from './infrastructure/persistence/mikro-orm.config';
import { exceptionProducer } from './infrastructure/transport/exceptionProducer';
import {
  NOTIFICATION_MAX_RETRIES,
  notificatorIdentity,
} from './infrastructure/transport/transport.config';
import { NotificationRequestsController } from './interfaces/messaging/notification-requests.controller';

@Module({
  imports: [
    loggingModule({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'notificator',
    }),
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(mikroOrmConfig()),
    TenancyModule.forRoot({ http: false, resolver: TransportTenantResolver }),
    RetryPolicyModule.forRootAsync({
      useFactory: () => ({
        exceptionProducer: exceptionProducer(),
        defaultMaxRetries: NOTIFICATION_MAX_RETRIES,
      }),
    }),
    TransportEventBusModule.forRoot({
      identity: notificatorIdentity(),
      inbox: MikroOrmMessageInbox,
    }),
    MailModule.forRootAsync({
      useFactory: () => {
        const mail = mailSettingsFromEnv();
        return {
          transport: mail.transport,
          defaults: { from: mail.from },
          template: { resolver: new ReactEmailTemplateResolver() },
          plugins: [plainTextFromHtml()],
        };
      },
    }),
    NotificationChannelsModule.forRoot({
      notifications: [PostCreatedNotification],
      push: firebasePushOptionsFromEnv(),
    }),
  ],
  controllers: [NotificationRequestsController],
  providers: [SendOnNotificationReceived, SendNotificationCommand.Handler],
})
export class AppModule {}
