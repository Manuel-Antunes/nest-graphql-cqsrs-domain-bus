# transport-eventbus

This library is a vendored and adapted copy of
[**nestjs-transport-eventbus**](https://github.com/sergey-telpuk/nestjs-transport-eventbus) v1.0.24
by Sergey Telpuk, MIT licensed (see `LICENSE`), with an integration layer built on top of it — and,
since `@nestjs/outbox` was published, with that package doing the publishing and the remembering
that upstream's destinations and this repository's inbox used to do.

## What came from upstream, and is still here

The integration point, which is the reason this library is built on it rather than beside it:

| piece | what it does |
|---|---|
| `TransportEventBusService implements IEventBus` | **the** idea: a drop-in replacement for the CQRS `EventBus`. Everything that already publishes — a handler, a saga, an aggregate's `commit()` — publishes through it without a line of its code changing |
| `TransportEventBusPublisher extends EventPublisher` | so `mergeObjectContext(aggregate)` binds the aggregate to that bus |
| `@ExcludeDef()` | an event that does **not** run locally, only remotely |
| `TRANSPORT_EVENT_BUS_SERVICE` / `_PUBLISHER` / `_PATTERN` | the injection tokens, and the pattern an event with no namespace would be addressed under — such an event no longer leaves the process, see below |

Its integration test suite is ported as `src/transport-event-bus.service.spec.ts`: what runs locally,
what leaves, what `@ExcludeDef` costs, `publishAll`, a saga, a service injecting the bus, an aggregate
committed through the publisher — now over the outbox.

## What upstream had and is gone

- **`@Publisher(...)` and `ITransportPublisherEventBus`** — a class holding a `ClientProxy` as a
  destination. The destinations are `@nestjs/outbox`'s transports now: one `ClientProxyTransport` per
  namespace a service publishes (`destinations` in `TransportEventBusModule`'s options), and the
  outbox's `route` reads the namespace off each message. The event's `@EventType` is the only place
  that says where it goes; there is no second declaration to keep in step with it.
- **`EVERY_NAMESPACE`, upstream's "one bus, everything" mode, and its `{ eventName, payload }` wire
  shape.** An event with no `@EventType` has no namespace, so no destination takes it and it stays in
  the process; nothing here reads upstream's shape any more.
- **`@TransportEvent()`**, upstream's receiving parameter decorator, which became a pipe here and is now
  gone too: a controller takes the `OutboxEnvelope` with Nest's own `@Payload()` — `@nestjs/outbox`'s
  consumer pattern — and hands it to `EventIngestion`, which rebuilds the event.

## What the new versions forced

1. **The event has to be rebuilt as its real class.** Upstream builds an anonymous class and forges its
   `name`, because `@nestjs/cqrs` 7 matched a handler by the event's class *name*. Version 12 does not:
   `@EventsHandler(SomeEvent)` stamps `{ id: randomUUID() }` on the event class itself and
   `filterEventWithId` compares that id, read off the instance's constructor. A forged class carries no
   such id, so **no handler, no saga and no subscription would match, and the event would be dropped in
   silence**. Reconstruction therefore goes through a registry of declared event types (`@EventType` in
   `@nestposts/platform`), which is also what gives the wire a name that is stable across processes.
2. **`@ExcludeDef` writes metadata instead of returning a subclass.** Upstream's decorators replace the
   class with a subclass carrying extra readonly fields. Here the domain events also carry `@AutoMap()`
   properties, and AutoMapper reads `design:type` metadata off the class it was told about — a
   substituted class is a class the mapper does not know.
3. **Nothing here imports `CqrsModule`.** In `@nestjs/cqrs` 12, `CqrsModule.forRoot()` is a *dynamic,
   global* module of the same class, and importing the static one alongside these providers yields a
   second `EventBus` whose handlers nobody registered. The bus is taken from wherever the application
   put CQRS.
4. **The bus signatures follow `IEventBus` of version 12**, which takes a dispatcher context and an
   `AsyncContext` — what lets this application's `Scope.REQUEST` command handlers stamp their events
   through `publisher.mergeObjectContext(aggregate, request)`.

## What `@nestjs/outbox` does here

- **Publishing is writing.** `TransportEventBusService` stages what an aggregate commits in the unit of
  work (`@nestposts/cqsrs`), which now runs in a transaction (`UnitOfWorkTransaction`, bound to
  `MikroOrmUnitOfWorkTransaction`); in its prepare phase `EventOutbox` turns each event whose namespace
  has a destination into one outbox message and writes it with `Outbox.add(tx, …)` — so the event
  commits with the writes that raised it, or neither does. The relay publishes it afterwards, retries
  it with backoff, and dead-letters it when it cannot. There is no direct emit any more.
- **The wire is the `OutboxEnvelope`** — `id`, `topic`, `key`, `headers`, `createdAt`, `payload` — in
  Nest's own `{ pattern, data }` packet, and each transport's placement is `ClientProxyTransport`'s
  `toPacket` (`OutboxPackets`): an `RmqRecord` with the headers as AMQP headers, an `SnsRecord` with
  the routing facts as message attributes and the aggregate as FIFO group, an `InngestRecord` with the
  message id as idempotency key. The per-transport `EventEnvelopeSerializer`/`Deserializer` pairs this
  repository had written are gone: the transports' default serializers and deserializers carry it.
- **The inbox is `@nestjs/outbox`'s `OutboxInbox`**, keyed by `(consumer, message)` — the consuming
  service's name and the envelope's id — so two services ingesting the same event each keep their own
  memory of it, which the table keyed by the message alone could not.
- **`MikroOrmOutboxStore`** implements both of the package's storage contracts on MikroORM and
  PostgreSQL, in native SQL (advisory locks per key, `FOR UPDATE SKIP LOCKED` claims, writes fenced by
  the lease owner), scoped by the producing service because one `transport` schema serves every
  service; it passes the package's contract suites with their concurrency cases.

## What this repository adds on top

Everything under `outbound/`, `inbound/`, `outbox/` and `persistence/`, none of which upstream has:

- **headers of what an event is** (`message-headers.ts`, `EventMessages`): a stable message type, a
  timestamp, the origin, the event's tags, the request and the trace — captured when the event is
  staged, because the relay publishes later, in no request at all;
- **an address the event answers for itself** (`EventAddress`): the message type, the tags, and a topic
  routing key of `namespace.Name.aggregateTag`, so a consumer binds to the slice it wants
  (`EventAddress.everyEventOf`), and the ordering key a message is published under;
- **one transaction per ingested message**: `EventIngestion` records the message in the inbox,
  appends it to the event log and publishes it on the local bus inside one unit of work, whose
  reactions — a projection, a saga's command — join it, and whose own events go to the outbox in the
  same transaction. A reaction that fails rolls the inbox row back with everything else, so the
  transport's redelivery is acted on; this replaced a "forget the inbox row after the fact" that a
  crash in the middle could skip;
- an **event log** (`persistence/event-log`): the stream of an aggregate, a generic
  `EventSourcedRepository` that replays it, and the log-backed `EventBus` subscriptions read across
  processes;
- an **origin mark** on every message, which is what keeps "everything published locally leaves" and
  "everything received is published locally" from feeding each other forever;
- **request-context propagation** across the hop (`RequestContextCodec`), and `@TransportRequest()`,
  which hands that request to a controller so a command dispatched there runs in it;
- **the relay's place in a process** (`OutboxRelayMode`): polling in a long-lived process, drained
  before a unit of work answers in a function, and off in an API-only instance — with
  `OutboxHousekeeping` for what the package leaves to the application: pruning the inbox, reporting the
  outbox's lag and its dead letters, and a `sweep()` a schedule runs;
- **a trace across the hop** (`tracing.ts`): the trace an event was published in is stamped on it and
  written into its headers, and a consumer span wraps the whole ingestion;
- the **doubles** that make all of the above testable with nothing running: `MemoryClient`,
  `startInProcessService`, `RecordingClient` and `publishedEnvelope`;
- **the AWS and Inngest transports**, in `@nestposts/microservices-aws` and
  `@nestposts/microservices-inngest`: client proxies, strategies, contexts and record builders, which
  know nothing of this library. What stays here is what needs `@EventType`: the SNS filter policy built
  from a binding (`SnsFilterPolicy`) and `inngestTriggers`.
