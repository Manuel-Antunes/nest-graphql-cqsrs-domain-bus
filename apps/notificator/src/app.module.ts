import { join } from 'node:path';
import type { YogaFederationDriverConfig } from '@graphql-yoga/nestjs-federation';
import { YogaFederationDriver } from '@graphql-yoga/nestjs-federation';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import { authNotifications } from '@nestposts/auth/domain/auth/notification/auth-notifications';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { SubscriptionChangeNotification } from '@nestposts/billing/domain/billing/notification/subscription-change.notification';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { MailModule } from '@nestposts/mail/mail.module';
import { plainTextFromHtml } from '@nestposts/mail/plain-text.plugin';
import { ReactEmailTemplateResolver } from '@nestposts/mail/react-email-template.resolver';
import { NotificationChannelsModule } from '@nestposts/notifications/infrastructure/notification-channels.module';
import { loggingModuleAsync } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import { useGraphQLErrorReporting } from '@nestposts/observability/graphql-error-reporting';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';
import { OrganizationInvitationNotification } from '@nestposts/organizations/domain/organization/notification/organization-invitation.notification';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { TenantMembershipModule } from '@nestposts/organizations/infrastructure/tenancy/tenant-membership.module';
import { PostCreatedNotification } from '@nestposts/posts/domain/post/notification/post-created.notification';
import { RetryPolicyModule } from '@nestposts/retry-policy/retry-policy.module';
import {
  IncomingRequest,
  MikroOrmMessageInbox,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportIdentity,
  TransportTenantResolver,
} from '@nestposts/transport-eventbus';
import { Inngest } from 'inngest';

import { SendNotificationCommand } from './application/send-notification.command';
import { SendOnNotificationReceived } from './application/send-on-notification-received.saga';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import type { AwsConfig } from './config/aws.config';
import { awsConfig } from './config/aws.config';
import type { FirebaseConfig } from './config/firebase.config';
import { firebaseConfig } from './config/firebase.config';
import type { InngestConfig } from './config/inngest.config';
import { inngestConfig } from './config/inngest.config';
import type { MailConfig } from './config/mail.config';
import { mailConfig } from './config/mail.config';
import type { PostgresConfig } from './config/postgres.config';
import { postgresConfig } from './config/postgres.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import { MikroOrmConfiguration } from './infrastructure/persistence/mikro-orm.config';
import { ExceptionProducers } from './infrastructure/transport/exception-producers';
import { GraphQLJSON } from './interfaces/graphql/json.scalar';
import { InterfacesModule } from './interfaces/interfaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [
        appConfig,
        authConfig,
        awsConfig,
        firebaseConfig,
        inngestConfig,
        mailConfig,
        postgresConfig,
        rabbitmqConfig,
      ],
    }),
    loggingModuleAsync({
      inject: [appConfig.KEY],
      useFactory: ({ serviceName, logLevel }: AppConfig) => ({
        serviceName,
        level: logLevel,
      }),
    }),
    ErrorReportingModule.forRoot({ traceOf: IncomingRequest.traceOf }),
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRootAsync({
      inject: [postgresConfig.KEY],
      useFactory: (postgres: PostgresConfig) =>
        MikroOrmConfiguration.connection(postgres),
    }),
    TenancyModule.forRoot({
      resolver: TransportTenantResolver,
      migrations: MikroOrmConfiguration.tenantMigrations(),
    }),
    AuthInfrastructureModule.forRoot({
      config: authConfig.KEY,
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
      plugins: [useGraphQLTracing(), useGraphQLErrorReporting()],
    }),
    RetryPolicyModule.forRootAsync({
      inject: [appConfig.KEY, awsConfig.KEY],
      useFactory: (app: AppConfig, aws: AwsConfig) => ({
        exceptionProducer: ExceptionProducers.for(app, aws),
        defaultMaxRetries: app.maxRetries,
      }),
    }),
    TransportEventBusModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name }: AppConfig) =>
        TransportIdentity.named(name, { publishes: false }),
      inbox: MikroOrmMessageInbox,
    }),
    MailModule.forRootAsync({
      inject: [mailConfig.KEY],
      useFactory: ({ transport, from }: MailConfig) => ({
        transport,
        defaults: { from },
        template: { resolver: new ReactEmailTemplateResolver() },
        plugins: [plainTextFromHtml()],
      }),
    }),
    NotificationChannelsModule.forRootAsync({
      notifications: [
        PostCreatedNotification,
        ...authNotifications,
        OrganizationInvitationNotification,
        SubscriptionChangeNotification,
      ],
      inject: [firebaseConfig.KEY],
      useFactory: ({ push }: FirebaseConfig) => ({ push }),
    }),
    InterfacesModule,
  ],
  providers: [
    SendOnNotificationReceived,
    SendNotificationCommand.Handler,
    {
      provide: Inngest,
      inject: [appConfig.KEY, inngestConfig.KEY],
      useFactory: (app: AppConfig, { client }: InngestConfig) =>
        new Inngest({ id: app.name, ...client }),
    },
  ],
})
export class AppModule {}
