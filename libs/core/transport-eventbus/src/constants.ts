/**
 * The tokens and the default pattern, from upstream — see `NOTICE.md`.
 */

/**
 * The message pattern an event goes out under when the transport has no topic semantics of its own.
 *
 * Upstream sends **everything** under this one pattern: one queue, every event, and the type inside
 * the payload. Here it is only what {@link EventAddress.routingKey} answers for an event with no
 * `@EventType` — which has no namespace, and so no destination, and never leaves the process. Every
 * event that does leave goes out under `namespace.Name.aggregateTag`, so a consumer can bind to
 * `posts.PostCreated.*` rather than to everything.
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

/** The namespaces this service publishes: the keys of the outbox's `destinations`. */
export const TRANSPORT_OUTBOX_DESTINATIONS = Symbol(
  'TransportOutboxDestinations',
);

/** The application's `TransportOutboxSettings`, resolved. */
export const TRANSPORT_OUTBOX_SETTINGS = Symbol('TransportOutboxSettings');
