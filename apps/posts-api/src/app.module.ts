import { join } from 'node:path';
import { AutomapperModule } from '@automapper/nestjs';
import type { YogaFederationDriverConfig } from '@graphql-yoga/nestjs-federation';
import { YogaFederationDriver } from '@graphql-yoga/nestjs-federation';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import { OutboxModule } from '@nestjs/outbox';
import { StorageModule } from '@nestjs/storage';
import { AttachmentModule } from '@nestposts/asset/infrastructure/attachment.module';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { RequestCredentials } from '@nestposts/auth/infrastructure/request/request-credentials';
import { CqsrsModule } from '@nestposts/cqsrs';
import {
  DatabaseModule,
  MessageTenantResolver,
  TenancyModule,
} from '@nestposts/database';
import {
  MikroOrmEventStorageEngine,
  MikroOrmEventStoreModule,
} from '@nestposts/event-store-mikro-orm';
import {
  GraphQLResponseCache,
  GraphQLResponseCacheModule,
} from '@nestposts/graphql-response-cache';
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
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmTransactionManager,
} from '@nestposts/outbox-mikro-orm';
import { RedisCacheOptions, RedisModule } from '@nestposts/redis';
import {
  EventTrace,
  IncomingRequest,
  LoggingErrorHandler,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';

import { PostRequestContextCodec } from './application/shared/post-request-context.codec';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import { awsConfig } from './config/aws.config';
import { inngestConfig } from './config/inngest.config';
import type { OutboxConfig } from './config/outbox.config';
import { outboxConfig } from './config/outbox.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import type { RedisConfig } from './config/redis.config';
import { redisConfig } from './config/redis.config';
import { storageConfig } from './config/storage.config';
import { MikroOrmConfiguration } from './infrastructure/persistence/mikro-orm.config';
import { BucketDisks } from './infrastructure/storage/bucket-disks';
import { PostEventsClient } from './infrastructure/transport/post-events.client';
import { PostEventsClientModule } from './infrastructure/transport/post-events-client.module';
import { RESPONSE_CACHE_GROUP } from './interfaces/graphql/response-cache-invalidation.handler';
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
        awsConfig,
        inngestConfig,
        outboxConfig,
        rabbitmqConfig,
        redisConfig,
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
    DatabaseModule.forRoot(MikroOrmConfiguration.connection()),
    TenancyModule.forRoot({
      resolver: MessageTenantResolver,
      migrations: MikroOrmConfiguration.tenantMigrations(),
    }),
    ConditionalModule.registerWhen(
      RedisModule.forRootAsync({
        inject: [redisConfig.KEY],
        useFactory: ({ url }: RedisConfig) => ({ url }),
      }),
      () => Boolean(redisConfig().url),
    ),
    CacheModule.registerAsync({ isGlobal: true, useClass: RedisCacheOptions }),
    AuthInfrastructureModule.forRoot({
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
      notifications: PublishingOnDemandNotifications,
    }),
    TenantMembershipModule,
    GraphQLModule.forRootAsync<YogaFederationDriverConfig>({
      driver: YogaFederationDriver,
      imports: [GraphQLResponseCacheModule],
      inject: [appConfig.KEY, GraphQLResponseCache],
      useFactory: (
        { subscriptionMaxSeconds }: AppConfig,
        responseCache: GraphQLResponseCache,
      ) => ({
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
          responseCache.plugin({ session: RequestCredentials.keyOf }),
        ],
      }),
    }),
    AutomapperModule.forRoot({
      strategyInitializer: validatedDtoClasses(),
      errorHandler: new MapperErrorHandler(),
    }),
    StorageModule.forRootAsync({ useClass: BucketDisks }),
    AttachmentModule.forRoot({}),
    OutboxModule.forRootAsync({
      imports: [PostEventsClientModule],
      transports: PostEventsClient.destinations(appConfig()),
      inject: [appConfig.KEY, outboxConfig.KEY],
      useFactory: (
        app: AppConfig,
        { relay, pollInterval, retry }: OutboxConfig,
      ) => ({
        route: PostEventsClient.route(app),
        relay: { enabled: relay === 'poll', pollInterval },
        retry,
      }),
    }),
    MikroOrmOutboxModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name }: AppConfig) => ({ producer: name }),
    }),
    ...(appConfig().subscriptionsFromFeed ? [MikroOrmEventStoreModule] : []),
    TransportEventBusModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name, publishes }: AppConfig) =>
        TransportIdentity.named(name, { publishes }),
      transactionManager: MikroOrmTransactionManager,
      inbox: { descriptions: MikroOrmOutboxStore },
      outbox: {
        destinations: PostEventsClient.namespaces,
        inject: [appConfig.KEY, outboxConfig.KEY],
        useFactory: (app: AppConfig, { relay }: OutboxConfig) => ({
          relay,
          route: PostEventsClient.route(app),
        }),
      },
      requestContext: PostRequestContextCodec,
      processingGroups: {
        notifications: 'streaming',
        [RESPONSE_CACHE_GROUP]: {
          processor: 'subscribing',
          errorHandler: new LoggingErrorHandler(),
        },
      },
      ...(appConfig().subscriptionsFromFeed
        ? {
            eventStore: { engine: MikroOrmEventStorageEngine },
            subscriptions: true,
          }
        : {}),
    }),
    PostEventsClientModule,
    InterfacesModule,
  ],
})
export class AppModule {}
