import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import {
  IngestionSink,
  MessageInbox,
  MikroOrmMessageInbox,
  NoDurableState,
  OutboxRouting,
  RequestContextCodec,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_EVENT_BUS_SERVICE,
  TransportIdentity,
  transportEventBusProviders,
} from '@nestposts/transport-eventbus';
import { PostRequestContextCodec } from '../../src/application/shared/post-request-context.codec';
import { SilentIdentity } from './silent-identity';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    ...transportEventBusProviders,
    { provide: TransportIdentity, useClass: SilentIdentity },
    { provide: RequestContextCodec, useClass: PostRequestContextCodec },
    { provide: IngestionSink, useClass: NoDurableState },
    { provide: MessageInbox, useClass: MikroOrmMessageInbox },
  ],
  exports: [
    TRANSPORT_EVENT_BUS_SERVICE,
    TRANSPORT_EVENT_BUS_PUBLISHER,
    OutboxRouting,
    MessageInbox,
  ],
})
export class TransportTestingModule {}
