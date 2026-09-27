import { join } from 'node:path';
import { AutomapperModule } from '@automapper/nestjs';
import type { YogaFederationDriverConfig } from '@graphql-yoga/nestjs-federation';
import { YogaFederationDriver } from '@graphql-yoga/nestjs-federation';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import { StorageModule } from '@nestjs/storage';
import { AttachmentModule } from '@nestposts/asset/infrastructure/attachment.module';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { PublishingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/publishing-on-demand-notifications';
import { loggingModuleAsync } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import { useGraphQLErrorReporting } from '@nestposts/observability/graphql-error-reporting';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { TenantMembershipModule } from '@nestposts/organizations/infrastructure/tenancy/tenant-membership.module';
import {
  EventTrace,
  IncomingRequest,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportIdentity,
  TransportTenantResolver,
} from '@nestposts/transport-eventbus';

import { PostRequestContextCodec } from './application/shared/post-request-context.codec';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { awsConfig } from './config/aws.config';
import { inngestConfig } from './config/inngest.config';
import type { OutboxConfig } from './config/outbox.config';
import { outboxConfig } from './config/outbox.config';
import type { PostgresConfig } from './config/postgres.config';
import { postgresConfig } from './config/postgres.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import { storageConfig } from './config/storage.config';
import { MikroOrmConfiguration } from './infrastructure/persistence/mikro-orm.config';
import { BucketDisks } from './infrastructure/storage/bucket-disks';
import { PostEventsClient } from './infrastructure/transport/post-events.client';
import { PostEventsClientModule } from './infrastructure/transport/post-events-client.module';
import { subscriptionDeadline } from './interfaces/graphql/subscription-deadline.plugin';
import { InterfacesModule } from './interfaces/interfaces.module';
import { MapperErrorHandler } from './interfaces/mapper/mapper-error.handler';
import { validatedDtoClasses } from './interfaces/mapper/validated-dto.strategy';

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
        inngestConfig,
        outboxConfig,
        postgresConfig,
        rabbitmqConfig,
        storageConfig,
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
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
      notifications: PublishingOnDemandNotifications,
    }),
    TenantMembershipModule,
    GraphQLModule.forRootAsync<YogaFederationDriverConfig>({
      driver: YogaFederationDriver,
      inject: [appConfig.KEY],
      useFactory: ({ subscriptionMaxSeconds }: AppConfig) => ({
        typePaths: [join(__dirname, 'graphql', '**/*.graphql')],
        resolvers: { DateTime: GraphQLISODateTime },
        fieldResolverEnhancers: ['interceptors'],
        graphiql: true,
        maskedErrors: false,
        plugins: [
          useGraphQLTracing({ originOf: EventTrace.of }),
          useGraphQLErrorReporting(),
          ...(subscriptionMaxSeconds
            ? [subscriptionDeadline(subscriptionMaxSeconds)]
            : []),
        ],
      }),
    }),
    AutomapperModule.forRoot({
      strategyInitializer: validatedDtoClasses(),
      errorHandler: new MapperErrorHandler(),
    }),
    StorageModule.forRootAsync({ useClass: BucketDisks }),
    AttachmentModule.forRoot({}),
    TransportEventBusModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name, publishes }: AppConfig) =>
        TransportIdentity.named(name, { publishes }),
      inbox: true,
      outbox: {
        imports: [PostEventsClientModule],
        destinations: PostEventsClient.destinations(appConfig()),
        inject: [outboxConfig.KEY],
        useFactory: (outbox: OutboxConfig) => outbox,
      },
      requestContext: PostRequestContextCodec,
      subscriptions: appConfig().subscriptionsFromFeed,
    }),
    PostEventsClientModule,
    InterfacesModule,
  ],
})
export class AppModule {}
