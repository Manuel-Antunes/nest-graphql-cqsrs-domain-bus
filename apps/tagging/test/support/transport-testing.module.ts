import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import {
  CorrelatedRequestContext,
  EventSourcedRepository,
  EventStore,
  RequestContextCodec,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_EVENT_BUS_SERVICE,
  TransportIdentity,
  eventStoreProviders,
  transportEventBusProviders,
} from '@nestposts/transport-eventbus';
import { SilentIdentity } from './silent-identity';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    ...transportEventBusProviders,
    ...eventStoreProviders,
    EventSourcedRepository.of(Post),
    { provide: TransportIdentity, useClass: SilentIdentity },
    { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
  ],
  exports: [
    TRANSPORT_EVENT_BUS_SERVICE,
    TRANSPORT_EVENT_BUS_PUBLISHER,
    EventStore,
    EventSourcedRepository,
  ],
})
export class TransportTestingModule {}
