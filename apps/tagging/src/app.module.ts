import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { OutboxModule } from '@nestjs/outbox';
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
import { loggingModuleAsync } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmTransactionManager,
} from '@nestposts/outbox-mikro-orm';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { RedisCacheOptions, RedisModule } from '@nestposts/redis';
import { RetryPolicyModule } from '@nestposts/retry-policy/retry-policy.module';
import {
  IncomingRequest,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { CompleteOnPostPreCreated } from './application/complete-on-post-pre-created.saga';
import { CompletePostWithDefaultTagCommand } from './application/complete-post-with-default-tag.command';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import type { AwsConfig } from './config/aws.config';
import { awsConfig } from './config/aws.config';
import { inngestConfig } from './config/inngest.config';
import type { OutboxConfig } from './config/outbox.config';
import { outboxConfig } from './config/outbox.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import type { RedisConfig } from './config/redis.config';
import { redisConfig } from './config/redis.config';
import { MikroOrmConfiguration } from './infrastructure/persistence/mikro-orm.config';
import { ExceptionProducers } from './infrastructure/transport/exception-producers';
import { PostEventsClient } from './infrastructure/transport/post-events.client';
import { PostEventsClientModule } from './infrastructure/transport/post-events-client.module';
import { PostEventsController } from './interfaces/messaging/post-events.controller';

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
    DatabaseModule.forRoot(),
    DatabaseModule.forFeature([...postsEntities, ...usersEntities]),
    ConditionalModule.registerWhen(
      RedisModule.forRootAsync({
        inject: [redisConfig.KEY],
        useFactory: ({ url }: RedisConfig) => ({ url }),
      }),
      () => Boolean(redisConfig().url),
    ),
    CacheModule.registerAsync({ isGlobal: true, useClass: RedisCacheOptions }),
    TenancyModule.forRoot({
      http: false,
      resolver: MessageTenantResolver,
      migrations: MikroOrmConfiguration.tenantMigrations(),
    }),
    RetryPolicyModule.forRootAsync({
      inject: [appConfig.KEY, awsConfig.KEY],
      useFactory: (app: AppConfig, aws: AwsConfig) => ({
        exceptionProducer: ExceptionProducers.for(app, aws),
        defaultMaxRetries: app.maxRetries,
      }),
    }),
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
    MikroOrmEventStoreModule,
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
      eventStore: {
        engine: MikroOrmEventStorageEngine,
        entities: [{ entity: Post, tagKey: 'postId' }],
      },
    }),
    PostEventsClientModule,
  ],
  controllers: [PostEventsController],
  providers: [
    CompleteOnPostPreCreated,
    CompletePostWithDefaultTagCommand.Handler,
  ],
})
export class AppModule {}
