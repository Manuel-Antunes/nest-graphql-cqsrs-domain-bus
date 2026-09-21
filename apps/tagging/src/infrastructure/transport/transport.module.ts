import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import {
  CorrelatedRequestContext,
  EventIngestion,
  EventSourcedRepository,
  EventStore,
  MessageInbox,
  MikroOrmMessageInbox,
  OutboxRouting,
  RequestContextCodec,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_EVENT_BUS_SERVICE,
  TransportIdentity,
  eventIngestionProviders,
  eventStoreProviders,
  transportEventBusProviders,
} from '@nestposts/transport-eventbus';
import { PostEventsPublisher } from '../outbox/post-events.publisher';
import { POST_EVENTS_CLIENT, TaggingIdentity, postEventsClient } from './transport.config';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    ...transportEventBusProviders,
    ...eventIngestionProviders,
    ...eventStoreProviders,
    EventSourcedRepository.of(Post),
    { provide: TransportIdentity, useClass: TaggingIdentity },
    { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
    { provide: MessageInbox, useClass: MikroOrmMessageInbox },
    PostEventsPublisher,
    { provide: POST_EVENTS_CLIENT, useFactory: postEventsClient },
  ],
  exports: [
    TRANSPORT_EVENT_BUS_SERVICE,
    TRANSPORT_EVENT_BUS_PUBLISHER,
    EventIngestion,
    OutboxRouting,
    MessageInbox,
    EventStore,
    EventSourcedRepository,
  ],
})
export class TransportModule {}
