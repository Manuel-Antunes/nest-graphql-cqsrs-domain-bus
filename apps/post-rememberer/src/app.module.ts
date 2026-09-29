import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { RetryPolicyModule } from '@nestposts/retry-policy/retry-policy.module';
import {
  IncomingRequest,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';
import { Inngest } from 'inngest';

import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import type { AwsConfig } from './config/aws.config';
import { awsConfig } from './config/aws.config';
import type { InngestConfig } from './config/inngest.config';
import { inngestConfig } from './config/inngest.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import { MikroOrmConfiguration } from './infrastructure/persistence/mikro-orm.config';
import { ExceptionProducers } from './infrastructure/transport/exception-producers';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [appConfig, awsConfig, inngestConfig, rabbitmqConfig],
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
    OutboxModule.forRoot({ relay: { enabled: false } }),
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
      eventStore: {
        engine: MikroOrmEventStorageEngine,
        entities: [{ entity: Post, tagKey: 'postId' }],
      },
    }),
  ],
  providers: [
    {
      provide: Inngest,
      inject: [appConfig.KEY, inngestConfig.KEY],
      useFactory: (app: AppConfig, { client }: InngestConfig) =>
        new Inngest({ id: app.name, ...client }),
    },
  ],
})
export class AppModule {}
