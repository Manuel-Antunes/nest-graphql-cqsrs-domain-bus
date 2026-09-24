import { Module } from '@nestjs/common';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { loggingModule } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { RetryPolicyModule } from '@nestposts/retry-policy/retry-policy.module';
import {
  IncomingRequest,
  MikroOrmMessageInbox,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportTenantResolver,
} from '@nestposts/transport-eventbus';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { CompleteOnPostPreCreated } from './application/complete-on-post-pre-created.saga';
import { CompletePostWithDefaultTagCommand } from './application/complete-post-with-default-tag.command';
import { PostEventsPublisher } from './infrastructure/outbox/post-events.publisher';
import {
  mikroOrmConfig,
  tenantMigrations,
} from './infrastructure/persistence/mikro-orm.config';
import { exceptionProducer } from './infrastructure/transport/exceptionProducer';
import { postEventsClient } from './infrastructure/transport/postEventsClient';
import {
  POST_EVENTS_CLIENT,
  POST_EVENTS_MAX_RETRIES,
  taggingIdentity,
} from './infrastructure/transport/transport.config';
import { PostEventsController } from './interfaces/messaging/post-events.controller';

@Module({
  imports: [
    loggingModule({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'tagging' }),
    ErrorReportingModule.forRoot({ traceOf: IncomingRequest.traceOf }),
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(mikroOrmConfig()),
    DatabaseModule.forFeature([...postsEntities, ...usersEntities]),
    TenancyModule.forRoot({
      http: false,
      resolver: TransportTenantResolver,
      migrations: tenantMigrations(),
    }),
    RetryPolicyModule.forRootAsync({
      useFactory: () => ({
        exceptionProducer: exceptionProducer(),
        defaultMaxRetries: POST_EVENTS_MAX_RETRIES,
      }),
    }),
    TransportEventBusModule.forRoot({
      identity: taggingIdentity(),
      inbox: MikroOrmMessageInbox,
      eventStore: [Post],
      publishers: [
        PostEventsPublisher,
        { provide: POST_EVENTS_CLIENT, useFactory: postEventsClient },
      ],
    }),
  ],
  controllers: [PostEventsController],
  providers: [
    CompleteOnPostPreCreated,
    CompletePostWithDefaultTagCommand.Handler,
  ],
})
export class AppModule {}
