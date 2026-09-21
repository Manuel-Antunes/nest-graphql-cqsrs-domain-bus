import { Global, Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import {
  EventIngestion,
  IngestionSink,
  MessageInbox,
  MikroOrmMessageInbox,
  NoDurableState,
  OutboxRouting,
  RequestContextCodec,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TRANSPORT_EVENT_BUS_SERVICE,
  TransportIdentity,
  eventIngestionProviders,
  transportEventBusProviders,
} from "@nestposts/transport-eventbus";
import { PostRequestContextCodec } from "../../application/shared/post-request-context.codec";
import { PostEventsPublisher } from "../outbox/post-events.publisher";
import {
  POST_EVENTS_CLIENT,
  PostsApiIdentity,
  postEventsClient,
} from "./transport.config";

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    ...transportEventBusProviders,
    ...eventIngestionProviders,
    { provide: TransportIdentity, useClass: PostsApiIdentity },
    { provide: RequestContextCodec, useClass: PostRequestContextCodec },
    { provide: IngestionSink, useClass: NoDurableState },
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
  ],
})
export class TransportModule {}
