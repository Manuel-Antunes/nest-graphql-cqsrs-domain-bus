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
 * | the declaration | `@EventType({ namespace })` on the event, and one `ClientProxyTransport` per namespace | `@EventPattern` in the application, taking the envelope with `@Payload()` |
 * | what crosses | `@nestjs/outbox`'s `OutboxEnvelope`, in each transport's own record ({@link OutboxPackets}) |
 * | what keeps it once | the origin mark, and the outbox's relay until a broker takes it | the origin mark, `@nestjs/outbox`'s inbox, and the aggregate |
 */

export * from './aws/aws-message';
export * from './aws/sns-filter-policy';
export * from './constants';
export * from './decorators/exclude-def.decorator';
export * from './decorators/transport-request.decorator';
export * from './in-memory/memory-client';
export * from './inbound/event-ingestion';
export * from './inbound/event-reconstruction';
export * from './inbound/incoming-request';
export * from './inbound/transport-request.pipe';
export * from './inbound/transport-tenant.resolver';
export * from './inngest/inngest-triggers';
export * from './outbound/event-address';
export * from './outbound/event-messages';
export * from './outbound/message-headers';
export * from './outbound/outbox-packets';
export * from './outbound/transport-metadata';
export * from './outbox/event-outbox';
export * from './outbox/outbox-housekeeping';
export * from './outbox/transport-outbox.options';
export * from './persistence/event-log/event-log';
export * from './persistence/event-log/event-log.entity';
export * from './persistence/event-log/event-log.providers';
export * from './persistence/event-log/event-sourced.repository';
export * from './persistence/mikro-orm-unit-of-work.transaction';
export * from './persistence/outbox/mikro-orm-outbox.store';
export * from './persistence/outbox/outbox.entities';
export * from './persistence/transport-schema';
export * from './request-context';
export * from './subscriptions/event-sourced-event-bus';
export * from './tracing';
export * from './transport-event-bus.module';
export * from './transport-event-bus.options';
export * from './transport-event-bus.providers';
export * from './transport-event-bus.publisher';
export * from './transport-event-bus.service';
export * from './transport-identity';
/**
 * The doubles are NOT here: they live behind `@nestposts/transport-eventbus/testing`, because
 * `startInProcessService` reaches Testcontainers and every production bundle would carry it — see
 * that module's own note.
 */
