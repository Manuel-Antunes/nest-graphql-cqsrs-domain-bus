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
export * from './transport-event-bus.module';
export * from './transport-event-bus.options';
export * from './transport-event-bus.providers';
export * from './transport-event-bus.service';
export * from './transport-event-bus.publisher';
export * from './transport-identity';
export * from './request-context';
export * from './tracing';

export * from './decorators/exclude-def.decorator';
export * from './decorators/publisher.decorator';
export * from './decorators/transport-event.decorator';
export * from './decorators/transport-request.decorator';

export * from './interfaces/transport-data.interface';
export * from './interfaces/transport-publisher.interface';

export * from './outbound/event-address';
export * from './outbound/event-envelope';
export * from './outbound/event-envelope.factory';
export * from './outbound/serializers/event-envelope.serializer';
export * from './outbound/serializers/aws-event-envelope.serializer';
export * from './outbound/serializers/memory-event-envelope.serializer';
export * from './outbound/serializers/rmq-event-envelope.serializer';
export * from './outbound/event-forwarder';
export * from './outbound/outbox-routing';
export * from './outbound/transport-metadata';

export * from './inbound/deserializers/event-envelope.deserializer';
export * from './inbound/deserializers/sqs-event-envelope.deserializer';
export * from './inbound/deserializers/memory-event-envelope.deserializer';
export * from './inbound/deserializers/rmq-event-envelope.deserializer';
export * from './inbound/event-ingestion';
export * from './inbound/incoming-request';
export * from './inbound/transport-tenant.resolver';
export * from './inbound/transport-event.pipe';
export * from './inbound/transport-request.pipe';
export * from './inbound/event-reconstruction';

export * from './persistence/message-inbox';
export * from './persistence/message-inbox.entity';

export * from './aws/aws-client.config';
export * from './aws/aws-message';
export * from './aws/process-sqs-event';
export * from './aws/sns-client.proxy';
export * from './aws/sns-filter-policy';
export * from './aws/sns-record.builder';
export * from './aws/sqs-client.proxy';
export * from './aws/sqs-record.builder';
export * from './aws/sqs.context';
export * from './aws/sqs.events';
export * from './aws/sqs.strategy';

export * from './persistence/event-log/event-log';
export * from './persistence/event-log/event-log.entity';
export * from './persistence/event-log/event-log.providers';
export * from './persistence/event-log/event-sourced.repository';
export * from './subscriptions/event-sourced-event-bus';

export * from './in-memory/memory-client';
export * from './in-memory/topic-pattern';
/**
 * The doubles are NOT here: they live behind `@nestposts/transport-eventbus/testing`, because
 * `startInProcessService` reaches Testcontainers and every production bundle would carry it — see
 * that module's own note.
 */
