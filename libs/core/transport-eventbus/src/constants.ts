/** The `EventPublisher` that binds an aggregate to the transport bus — upstream's token, see `NOTICE.md`. */
export const TRANSPORT_EVENT_BUS_PUBLISHER = Symbol(
  'TransportEventBusPublisher',
);

/** The namespaces this service publishes: the keys of the outbox's `destinations`. */
export const TRANSPORT_OUTBOX_DESTINATIONS = Symbol(
  'TransportOutboxDestinations',
);

/** The application's `TransportOutboxSettings`, resolved. */
export const TRANSPORT_OUTBOX_SETTINGS = Symbol('TransportOutboxSettings');
