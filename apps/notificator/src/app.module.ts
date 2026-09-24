import { join } from 'node:path';
import type { YogaFederationDriverConfig } from '@graphql-yoga/nestjs-federation';
import { YogaFederationDriver } from '@graphql-yoga/nestjs-federation';
import { Module } from '@nestjs/common';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import { authNotifications } from '@nestposts/auth/domain/auth/notification/auth-notifications';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { MailModule } from '@nestposts/mail/mail.module';
import { plainTextFromHtml } from '@nestposts/mail/plain-text.plugin';
import { ReactEmailTemplateResolver } from '@nestposts/mail/react-email-template.resolver';
import { NotificationChannelsModule } from '@nestposts/notifications/infrastructure/notification-channels.module';
import { firebasePushOptionsFromEnv } from '@nestposts/notifications/infrastructure/push/firebase.options';
import { loggingModule } from '@nestposts/observability';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';
import { OrganizationInvitationNotification } from '@nestposts/organizations/domain/organization/notification/organization-invitation.notification';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { TenantMembershipModule } from '@nestposts/organizations/infrastructure/tenancy/tenant-membership.module';
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
import {
  mikroOrmConfig,
  tenantMigrations,
} from './infrastructure/persistence/mikro-orm.config';
import { exceptionProducer } from './infrastructure/transport/exceptionProducer';
import {
  NOTIFICATION_MAX_RETRIES,
  notificatorIdentity,
} from './infrastructure/transport/transport.config';
import { GraphQLJSON } from './interfaces/graphql/json.scalar';
import { InterfacesModule } from './interfaces/interfaces.module';

@Module({
  imports: [
    loggingModule({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'notificator',
    }),
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(mikroOrmConfig()),
    TenancyModule.forRoot({
      resolver: TransportTenantResolver,
      migrations: tenantMigrations(),
    }),
    AuthInfrastructureModule.forRoot({
      routes: false,
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
    }),
    TenantMembershipModule,
    GraphQLModule.forRoot<YogaFederationDriverConfig>({
      driver: YogaFederationDriver,
      typePaths: [join(__dirname, 'graphql', '**/*.graphql')],
      resolvers: { DateTime: GraphQLISODateTime, JSON: GraphQLJSON },
      fieldResolverEnhancers: ['guards', 'interceptors', 'filters'],
      graphiql: true,
      maskedErrors: false,
      plugins: [useGraphQLTracing()],
    }),
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
      notifications: [
        PostCreatedNotification,
        ...authNotifications,
        OrganizationInvitationNotification,
      ],
      push: firebasePushOptionsFromEnv(),
    }),
    InterfacesModule,
  ],
  providers: [SendOnNotificationReceived, SendNotificationCommand.Handler],
})
export class AppModule {}
