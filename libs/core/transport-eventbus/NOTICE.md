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
| `TRANSPORT_EVENT_BUS_PUBLISHER` | the injection token of that publisher |

Its integration test suite is ported as `src/transport-event-bus.service.spec.ts`: what runs locally,
what leaves, `publishAll`, a saga, a service injecting the bus, an aggregate committed through the
publisher — now over the outbox.

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
  consumer pattern — and hands it to `EventIngestion`, which rebuilds the event. Its sibling here,
  `@TransportRequest()` and its pipe, went the same way: no controller dispatched with it, and a
  controller that needs the request reads it with `IncomingRequest.from(envelope)`, the decode a guard
  already uses.
- **`@ExcludeDef()`**, the event that runs remotely and not locally. No event in the repository
  declared it, and with the outbox deciding what leaves by namespace it was the one thing an event
  still said about publishing.
- **`TRANSPORT_EVENT_BUS_SERVICE` and `TRANSPORT_EVENT_BUS_PATTERN`.** Nothing injected the bus by the
  token — the class is exported and is its own token — and the pattern only named the routing key of
  an event with no namespace, which no destination takes, so nothing was ever published under it.

## What the new versions forced

1. **The event has to be rebuilt as its real class.** Upstream builds an anonymous class and forges its
   `name`, because `@nestjs/cqrs` 7 matched a handler by the event's class *name*. Version 12 does not:
   `@EventsHandler(SomeEvent)` stamps `{ id: randomUUID() }` on the event class itself and
   `filterEventWithId` compares that id, read off the instance's constructor. A forged class carries no
   such id, so **no handler, no saga and no subscription would match, and the event would be dropped in
   silence**. Reconstruction therefore goes through a registry of declared event types (`@EventType` in
   `@nestposts/platform`), which is also what gives the wire a name that is stable across processes.
2. **Nothing here imports `CqrsModule`.** In `@nestjs/cqrs` 12, `CqrsModule.forRoot()` is a *dynamic,
   global* module of the same class, and importing the static one alongside these providers yields a
   second `EventBus` whose handlers nobody registered. The bus is taken from wherever the application
   put CQRS.
3. **The bus signatures follow `IEventBus` of version 12**, which takes a dispatcher context and an
   `AsyncContext` — what lets this application's `Scope.REQUEST` command handlers stamp their events
   through `publisher.mergeObjectContext(aggregate, request)`.

## What `@nestjs/outbox` does here

- **The outbox is the application's.** Its `OutboxModule` — transports, route, relay, retry — is
  declared at the application's root and is global, and so is the store behind it
  (`MikroOrmOutboxModule`, `libs/core/outbox-mikro-orm`); this library injects `Outbox`, `OutboxRelay`
  and `OutboxInbox` and configures none of them. It did configure them once, from its own `forRoot`,
  with the MikroORM store inside it; they moved out so that this library holds the bus and nothing it
  merely uses.
- **Publishing is writing.** `TransportEventBusService` stages what an aggregate commits in the unit of
  work (`unit-of-work/`, which lived in `@nestposts/cqsrs` until it moved here, beside the bus it gives
  a commit to), which runs in the transaction the application names (`UnitOfWorkTransaction`;
  `MikroOrmUnitOfWorkTransaction` here); in its prepare phase `EventOutbox` turns each event whose
  namespace has a destination into one outbox message and writes it with `Outbox.add(tx, …)` through
  the unit's transaction handle — so the event commits with the writes that raised it, or neither
  does. The relay publishes it afterwards, retries
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
- **`MikroOrmOutboxStore`** (`libs/core/outbox-mikro-orm`, no longer part of this library)
  implements both of the package's storage contracts on MikroORM and PostgreSQL, in native SQL
  (advisory locks per key, `FOR UPDATE SKIP LOCKED` claims, writes fenced by the lease owner), scoped
  by the producing service because one `transport` schema serves every service; it passes the
  package's contract suites with their concurrency cases. It also keeps the inbox's descriptions —
  what each admitted message was and who produced it — which this library asks for through
  `InboxDescriptions`, an optional port the application points at it.

## What this repository adds on top

Everything under `outbound/`, `inbound/`, `outbox/`, `persistence/` and `unit-of-work/`, none of which
upstream has:

- **headers of what an event is** (`message-headers.ts`, `EventMessages`): a stable message type, a
  timestamp, the origin, the event's tags, the request and the trace — captured when the event is
  staged, because the relay publishes later, in no request at all;
- **an address the event answers for itself** (`EventAddress`): the message type, the tags, the
  qualified name that is the outbox message's topic, and a routing key of
  `namespace.Name.aggregateTag`, which each broker's packet reads back off the message
  (`EventAddress.ofMessage`), so a consumer binds to the slice it wants (`EventAddress.everyEventOf`),
  and the ordering key a message is published under;
- **a route that knows the process is a destination too** (`OutboxRoute`, `LocalDelivery`): a namespace
  the outbox has a transport for goes through it, and one it has none for goes to `@nestjs/outbox`'s
  own `local` transport, where an `@OnOutboxMessage()` handler the module declares for every published
  event restores it and tells it to the `EventBus` — which the unit of work's commit then does not,
  because the bus is given the same route. That is where `@nestjs/outbox` and `@nestjs/cqrs` meet: an
  event with no broker reaches its handlers through the outbox, after the commit, with its retries and
  its inbox. It replaced a `MemoryClient` with no servers, which an application with no broker
  published through to nobody, and the client itself is gone: a suite delivers on
  `TopicMemoryServer.emit` (`@nestposts/microservices-memory`), which matches the bindings the way a
  topic exchange does;
- **one transaction per ingested message**: `EventIngestion` records the message in the inbox,
  appends it to the event log and publishes it on the local bus inside one unit of work, whose
  reactions — a projection, a saga's command — join it, and whose own events go to the outbox in the
  same transaction. A reaction that fails rolls the inbox row back with everything else, so the
  transport's redelivery is acted on; this replaced a "forget the inbox row after the fact" that a
  crash in the middle could skip;
- an **event log** (`persistence/event-log`): the stream of an aggregate, a generic
  `EventSourcedRepository` that replays it — and does not save, because the bus appends what an
  aggregate commits — and the log-backed `EventBus` subscriptions read across processes. It is not the
  outbox's business: `@nestjs/outbox` deletes a message once a transport takes it, keeps only what
  leaves, and its inbox only who processed which id;
- an **origin mark** on every message, which is what keeps "everything published locally leaves" and
  "everything received is published locally" from feeding each other forever;
- **request-context propagation** across the hop (`RequestContextCodec`), and `IncomingRequest`,
  which hands that request to a guard, an interceptor or a controller so a command dispatched there
  runs in it;
- **a unit of work** (`unit-of-work/`), Axon's: every command and every ingested message runs in one,
  in the application's transaction, and answers only once its events are recorded and told;
- **the relay's place in a process** (`OutboxRelayMode`): polling in a long-lived process, drained
  before a unit of work answers in a function, and off in an API-only instance. What the package
  leaves to the application beyond that — pruning the inbox, reporting the outbox's lag and its dead
  letters, a `sweep()` a schedule runs — is `OutboxHousekeeping`, in `libs/core/outbox-mikro-orm`;
- **a trace across the hop** (`tracing.ts`): the trace an event was published in is stamped on it and
  written into its headers, and a consumer span wraps the whole ingestion;
- the **doubles** that make all of the above testable with nothing running: `startInProcessService`
  (on a `TopicMemoryServer`), `RecordingClient` and `publishedEnvelope`;
- **the AWS and Inngest transports**, in `@nestposts/microservices-aws` and
  `@nestposts/microservices-inngest`: client proxies, strategies, contexts and record builders, which
  know nothing of this library. What stays here is what needs `@EventType`: the SNS filter policy built
  from a binding (`SnsFilterPolicy`) and `inngestTriggers`.
