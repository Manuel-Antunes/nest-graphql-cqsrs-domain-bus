import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OutboxModule } from '@nestjs/outbox';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { loggingModuleAsync } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmUnitOfWorkTransaction,
  OutboxHousekeepingModule,
} from '@nestposts/outbox-mikro-orm';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { RetryPolicyModule } from '@nestposts/retry-policy/retry-policy.module';
import {
  IncomingRequest,
  routeOf,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportIdentity,
  TransportTenantResolver,
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
import type { PostgresConfig } from './config/postgres.config';
import { postgresConfig } from './config/postgres.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
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
    DatabaseModule.forFeature([...postsEntities, ...usersEntities]),
    TenancyModule.forRoot({
      http: false,
      resolver: TransportTenantResolver,
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
      inject: [outboxConfig.KEY],
      useFactory: ({ relay, pollInterval, retry }: OutboxConfig) => ({
        route: routeOf,
        relay: { enabled: relay === 'poll', pollInterval },
        retry,
      }),
    }),
    MikroOrmOutboxModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name }: AppConfig) => ({ producer: name }),
    }),
    OutboxHousekeepingModule.forRootAsync({
      inject: [outboxConfig.KEY],
      useFactory: ({ relay, inboxRetention }: OutboxConfig) => ({
        interval: relay === 'poll' ? '1h' : false,
        inboxRetention,
      }),
    }),
    TransportEventBusModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name, publishes }: AppConfig) =>
        TransportIdentity.named(name, { publishes }),
      transaction: MikroOrmUnitOfWorkTransaction,
      inbox: { descriptions: MikroOrmOutboxStore },
      outbox: {
        destinations: PostEventsClient.namespaces,
        inject: [outboxConfig.KEY],
        useFactory: ({ relay }: OutboxConfig) => ({ relay }),
      },
      eventStore: [Post],
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
