/**
 * **transport-eventbus** — Axon Framework 5's messaging, on `@nestjs/cqrs` and `@nestjs/outbox`.
 *
 * It began as a vendored copy of
 * [nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus) by Sergey
 * Telpuk (MIT); `NOTICE.md` says exactly what came from where and why each adaptation was forced, and
 * `README.md` is how to use it.
 *
 * ## The shape of it
 *
 * | Axon 5 | here |
 * |---|---|
 * | `UnitOfWork`, `ProcessingContext`, `ProcessingLifecycle` | {@link UnitOfWork}, {@link ProcessingContext}, {@link DefaultPhases} |
 * | `TransactionManager`, `UnitOfWorkFactory` | {@link TransactionManager}, {@link UnitOfWorkFactory} — the application names its ORM's manager |
 * | `EventMessage`, `CommandMessage`, `MessageType`, `Metadata` | {@link EventMessage}, {@link CommandMessage}, {@link MessageType}, {@link Metadata} |
 * | `CorrelationDataProvider`, `MessageOriginProvider` | {@link CorrelationDataProvider}, {@link MessageOriginProvider} |
 * | `MessageDispatchInterceptor`, `MessageHandlerInterceptor` | the same names |
 * | `EventSink` / `SimpleEventBus` | {@link TransportEventBusService}, `@nestjs/cqrs`'s `IEventBus` |
 * | `SubscribingEventProcessor` | {@link LocalEventDelivery}, in `PREPARE_COMMIT` |
 * | `PooledStreamingEventProcessor`, `TokenStore`, dead letters | {@link StreamingGroupDelivery}, on `@nestjs/outbox`'s relay, inbox and dead letters |
 * | processing groups, `SequencingPolicy`, `ErrorHandler` | {@link ProcessingGroup}, {@link SequencingPolicy}, {@link ErrorHandler} |
 * | `EventStore`, `EventStorageEngine`, `Tag`, `EventCriteria`, `AppendCondition` | the same names |
 * | `EventSourcingRepository` | {@link EventSourcingRepository} |
 *
 * And what Axon does not have, because Axon Server is its transport: the envelope on the wire of each
 * broker ({@link OutboxPackets}), the origin mark that keeps a service from ingesting its own echo,
 * and {@link EventIngestion}, where a broker's delivery becomes a unit of work.
 */

export * from './aws/aws-message';
export * from './aws/sns-filter-policy';
export * from './constants';
export * from './eventhandling/committed-events';
export * from './eventhandling/delivery-scope';
export * from './eventhandling/error-handler';
export * from './eventhandling/event-handling-components';
export * from './eventhandling/local-event-delivery';
export * from './eventhandling/processing-group';
export * from './eventhandling/processing-groups';
export * from './eventhandling/sequencing-policy';
export * from './eventsourcing/append-condition';
export * from './eventsourcing/event-criteria';
export * from './eventsourcing/event-sourcing.repository';
export * from './eventsourcing/event-storage-engine';
export * from './eventsourcing/event-store';
export * from './eventsourcing/tag';
export * from './inbound/event-ingestion';
export * from './inbound/event-reconstruction';
export * from './inbound/inbox-descriptions';
export * from './inbound/incoming-request';
export * from './inngest/inngest-triggers';
export * from './messaging/command-message';
export * from './messaging/correlation';
export * from './messaging/event-message';
export * from './messaging/interception';
export * from './messaging/message';
export * from './messaging/message-interceptors';
export * from './messaging/message-type';
export * from './outbound/event-address';
export * from './outbound/event-messages';
export * from './outbound/message-headers';
export * from './outbound/outbox-packets';
export * from './outbound/outbox-route';
export * from './outbound/transport-metadata';
export * from './outbox/event-outbox';
export * from './outbox/streaming-group-delivery';
export * from './outbox/transport-outbox.options';
export * from './request-context';
export * from './subscriptions/event-sourced-event-bus';
export * from './tracing';
export * from './transport-event-bus.module';
export * from './transport-event-bus.options';
export * from './transport-event-bus.publisher';
export * from './transport-event-bus.service';
export * from './transport-identity';
export * from './unit-of-work/phase';
export * from './unit-of-work/processing-context';
export * from './unit-of-work/processing-lifecycle';
export * from './unit-of-work/resource-key';
export * from './unit-of-work/transaction-manager';
export * from './unit-of-work/unit-of-work';
export * from './unit-of-work/unit-of-work-commands';
export * from './unit-of-work/unit-of-work-factory';
/**
 * The doubles are NOT here: they live behind `@nestposts/transport-eventbus/testing`, because
 * a production bundle must not carry `@nestjs/testing` — see
 * that module's own note.
 */
