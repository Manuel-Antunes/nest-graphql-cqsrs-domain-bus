/**
 * **transport-eventbus** — the CQRS event bus, speaking through Nest's microservice transports.
 *
 * A vendored and adapted copy of
 * [nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus) by Sergey
 * Telpuk (MIT), plus an integration layer. `NOTICE.md` says exactly what came from where and why each
 * adaptation was forced; `README.md` is how to use it.
 *
 * ## The shape of it
 *
 * | | outbound | inbound |
 * |---|---|---|
 * | the integration point | {@link TransportEventBusService}, an `IEventBus` | {@link EventIngestion}, called by the application's controllers |
 * | the declaration | {@link Publisher} on a class holding a client | `@EventPattern` in the application |
 * | what crosses | {@link EventEnvelopeSerializer} → {@link EventEnvelopeDeserializer}, the transporter's own extension points |
 * | what keeps it once | the origin mark | the origin mark, {@link MessageInbox}, and the aggregate |
 */
export * from './constants';
export * from './transport-event-bus.providers';
export * from './transport-event-bus.service';
export * from './transport-event-bus.publisher';
export * from './transport-identity';
export * from './request-context';

export * from './decorators/exclude-def.decorator';
export * from './decorators/publisher.decorator';
export * from './decorators/transport-event.decorator';
export * from './decorators/transport-request.decorator';

export * from './interfaces/transport-data.interface';
export * from './interfaces/transport-publisher.interface';

export * from './outbound/addressing/channel-addressing';
export * from './outbound/addressing/memory.addressing';
export * from './outbound/addressing/rabbitmq.addressing';
export * from './outbound/addressing/single-pattern.addressing';
export * from './outbound/addressing/topic.addressing';
export * from './outbound/event-address';
export * from './outbound/event-envelope';
export * from './outbound/event-envelope.factory';
export * from './outbound/serializers/event-envelope.serializer';
export * from './outbound/serializers/memory-event-envelope.serializer';
export * from './outbound/serializers/rmq-event-envelope.serializer';
export * from './outbound/event-forwarder';
export * from './outbound/outbox-routing';
export * from './outbound/transport-metadata';

export * from './inbound/deserializers/event-envelope.deserializer';
export * from './inbound/deserializers/memory-event-envelope.deserializer';
export * from './inbound/deserializers/rmq-event-envelope.deserializer';
export * from './inbound/event-ingestion';
export * from './inbound/incoming-request';
export * from './inbound/transport-event.pipe';
export * from './inbound/transport-request.pipe';
export * from './inbound/event-reconstruction';
export * from './inbound/ingestion-sink';

export * from './persistence/event-store/event-sourced.repository';
export * from './persistence/event-store/event-store';
export * from './persistence/event-store/event-store.entity';
export * from './persistence/event-store/event-store.providers';
export * from './persistence/event-store/event-store.sink';
export * from './persistence/message-inbox';
export * from './persistence/message-inbox.entity';

export * from './in-memory/memory-client';
export * from './in-memory/topic-pattern';
export * from './testing/in-process-service';
export * from './testing/recording.addressing';
export * from './testing/recording-client';
