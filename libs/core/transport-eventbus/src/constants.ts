/**
 * The tokens and the default pattern, from upstream — see `NOTICE.md`.
 */

/**
 * The message pattern an event goes out under when the transport has no topic semantics of its own.
 *
 * Upstream sends **everything** under this one pattern: one queue, every event, and the type inside
 * the payload. That still works here — it is what {@link EventAddress.routingKey} answers for an event
 * with no `@EventType`, which is the only identity such an event has — and the environment variable is
 * upstream's too, so a deployment can rename the pattern without touching code.
 *
 * On RabbitMQ with `wildcards: true` the pattern **is** the routing key, and an event that declares
 * one gets `namespace.Name.aggregateTag` instead, so a consumer can bind to `posts.PostCreated.*`
 * rather than to everything.
 */
export const TRANSPORT_EVENT_BUS_PATTERN =
  process.env.TRANSPORT_EVENT_BUS_PATTERN ?? 'TRANSPORT_EVENT_BUS_PATTERN';

/** The `IEventBus` that publishes locally **and** through the transports. */
export const TRANSPORT_EVENT_BUS_SERVICE = Symbol('TransportEventBusService');

/** The `EventPublisher` that binds an aggregate to the bus above. */
export const TRANSPORT_EVENT_BUS_PUBLISHER = Symbol(
  'TransportEventBusPublisher',
);

/** Metadata key. Upstream keeps this as a field on a substituted class — see `NOTICE.md`. */
export const EXCLUDE_DEF_METADATA = Symbol.for(
  'nestposts.transport-eventbus.exclude-def',
);
