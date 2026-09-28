# transport-eventbus

This library is a vendored and adapted copy of
[**nestjs-transport-eventbus**](https://github.com/sergey-telpuk/nestjs-transport-eventbus) v1.0.24
by Sergey Telpuk, MIT licensed (see `LICENSE`), with an integration layer built on top of it — and,
since `@nestjs/outbox` was published, with that package doing the publishing and the remembering
that upstream's destinations and this repository's inbox used to do. Its unit of work, its messages,
its event processing and its event store have since been ported to **Axon Framework 5**'s semantics;
**What the Axon 5 port changed**, below, is that account.

## What came from upstream, and is still here

The integration point, which is the reason this library is built on it rather than beside it:

| piece | what it does |
|---|---|
| `TransportEventBusService implements IEventBus` | **the** idea: a drop-in replacement for the CQRS `EventBus`. Everything that already publishes — a handler, a saga, an aggregate's `commit()` — publishes through it without a line of its code changing |
| `TransportEventBusPublisher extends EventPublisher` | so `mergeObjectContext(aggregate)` binds the aggregate to that bus |
| `TRANSPORT_EVENT_BUS_PUBLISHER` | the injection token of that publisher |

Its integration test suite is ported as `src/transport-event-bus.service.spec.ts`: what runs locally,
what leaves, `publishAll`, a saga, a service injecting the bus, an aggregate committed through the
publisher — now over the outbox, and with the unit of work's staging rules beside it.

`TransportEventBusService` is still upstream's class and upstream's idea; what it does inside changed
twice. It forwarded to a publisher, then staged into this repository's unit of work, and is now Axon
5's `EventSink`: a per-unit queue drained in `PREPARE_COMMIT`.

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
  a commit to), which runs in the transaction the application's `TransactionManager` opens
  (`MikroOrmTransactionManager` here); in its `PREPARE_COMMIT` `EventOutbox` turns each event whose
  namespace has a destination into one outbox message and writes it with `Outbox.add(tx, …)` through
  the unit's transaction handle — so the event commits with the writes that raised it, or neither
  does. The relay publishes it afterwards, retries it with backoff, and dead-letters it when it cannot.
  There is no direct emit any more.
- **The outbox is also a streaming processor's queue.** A streaming processing group is staged a
  message of its own per event (`@processing-group`, the group in the headers), which the relay
  delivers on its `local` transport to `StreamingGroupDelivery`: the relay's leases, order, retries and
  dead letters, and the package's own `OutboxHandlerContext.processInTransaction` for the inbox record,
  are what Axon 5's `PooledStreamingEventProcessor` gets from its token store.
- **The wire is the `OutboxEnvelope`** — `id`, `topic`, `key`, `headers`, `createdAt`, `payload` — in
  Nest's own `{ pattern, data }` packet, and each transport's placement is `ClientProxyTransport`'s
  `toPacket`. The per-transport `EventEnvelopeSerializer`/`Deserializer` pairs this repository had
  written are gone: the transports' default serializers and deserializers carry it.
- **The packets are the applications', not this library's.** They lived here for a while, as
  `OutboxPackets` in `outbound/` — an `RmqRecord` with the headers as AMQP headers and the id as
  `messageId`, an `SnsRecord` with the routing facts as message attributes, the message's `key` as FIFO
  group and the id as deduplication id, an `InngestRecord` with the id as idempotency key and the
  correlation id as the `correlation_id` session, `OutboxPackets.for(kind)` to pick one, and
  `OutboxPackets.inProcess` for a suite's client. They moved out because how a message goes on a
  broker is an implementation the deployment decides, not a semantics the library defines, and a
  library that owned it had to depend on every broker package it placed a record for. `libs/platform`,
  where shared application code would otherwise go, was not an option: this library depends on it —
  for `@EventType`, the aggregate root and the rest — and a packet built from `EventAddress` there
  would close a cycle. So each publishing application carries its own copy, identical and
  comment-free: `apps/posts-api` and `apps/tagging` in `infrastructure/transport/outbox-packets.ts`,
  each with the spec that was this library's beside it, and `apps/web` in `src/nest/outbox-packets.ts`,
  exercised by `apps/web-e2e` (every email the web sends is published through it, on Inngest and on
  RabbitMQ) rather than by a spec, because the web's Vitest runs in jsdom without the libraries'
  source aliases. The module constant `CORRELATION_SESSION` became
  `OutboxPackets.CORRELATION_SESSION`. What stays here is what a packet is built from —
  `EventAddress.ofMessage`, `routingAttributesOf` and the `AWS_*_ATTRIBUTE` names (shared with
  `SnsFilterPolicy`), the header names and `MessageOriginProvider.CORRELATION_ID` — and the one packet
  this library's own suites need, `InProcessPacket.of` in `/testing`: the envelope itself under the
  routing key, which replaced `OutboxPackets.inProcess`. The dependency on
  `@nestposts/microservices-aws` went with the SNS packet; `-inngest` remains, for `inngestTriggers`,
  and `-memory`, for `startInProcessService`.
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

## What the Axon 5 port changed

The unit of work this library had was Axon's in spirit and its own in the details: a unit was
*joined* by any work carrying the same request, it waited for tracked work through a flag
(`failOnTrackedFailure`), its phases were named `started`, `prepareCommit`, `commit`, `afterCommit`,
`rollback` and `cleanup`, and the local handlers were told after the commit. It was ported to Axon
Framework 5 — not 4 — because 5 is the version whose semantics fit a framework with no thread to bind
a unit to: a `ProcessingContext` passed along rather than a thread-local `CurrentUnitOfWork`. What
changed, and what forced each change:

- **A unit per message, and nothing joins** (`unit-of-work/`). `UnitOfWork`, `ProcessingLifecycle`,
  `ProcessingContext`, `DefaultPhases` (with Axon's orders), `ResourceKey`, `UnitOfWorkFactory` and
  `TransactionalUnitOfWorkFactory` are Axon 5's, rule for rule: registration into a running or an
  earlier phase throws, a failure finishes its phase and skips the rest, error and completion actions
  never change the outcome. `UnitOfWorkCommands` gives every command a unit of its own, as
  `SimpleCommandBus` does; joining by request is gone, and what crosses from a dispatcher to what it
  dispatches is correlation data. The context travels in an `AsyncLocalStorage` because
  `@nestjs/cqrs`'s `execute(command)` has no parameter for it — and only as a carrier.
- **The transaction is a `TransactionManager`**, Axon 5's port, which the application implements for
  its ORM (`MikroOrmTransactionManager`): begun in `PRE_INVOCATION`, committed in `COMMIT`, rolled
  back on error. Two units may still share a database transaction — a saga's command inside an
  ingestion joins it as a savepoint, as Axon's JPA manager joins the thread's — and a joined
  transaction hands its after-commit work to the one that owns it (`afterCommit`/`runAfterCommit`).
  Running that work inside the owning transaction's `commit()` was measured to fail —
  `Transaction is already committed`, from a drain that delivered to another unit inside the committed
  fork's MikroORM context — so it runs in the owning unit's `AFTER_COMMIT`, outside the transaction's
  scope.
- **Messages** (`messaging/`): `Message`, `EventMessage`, `CommandMessage`, `MessageType` and
  `Metadata`, attached to their payload because `@nestjs/cqrs` hands handlers the payload; Axon 5's
  correlation data providers and `CorrelationDataInterceptor`, and its dispatch and handler
  interceptors. The correlation headers took Axon's names, `correlationId` and `causationId`; the
  old `cqrs-transport-correlation-id` and `cqrs-transport-causation-id` are still read. The trace
  travels in the metadata. `RequestContextCodec` shrank to what it is for — `@nestjs/cqrs`'s
  `AsyncContext` and metadata, both ways — and `CorrelatedRequestContext` became
  `DefaultRequestContextCodec`.
- **Event processing** (`eventhandling/`): processing groups, `SubscribingEventProcessor`
  (`LocalEventDelivery`) and `PooledStreamingEventProcessor` (`StreamingGroupDelivery`, on the
  outbox), `ErrorHandler`, `SequencingPolicy` — which is the outbox message's `key`. The subscribing
  handlers now run in `PREPARE_COMMIT`, inside the publishing transaction, as in Axon 5, where they
  used to run after the commit; a subscribing handler that fails fails the unit. `CommittedEvents` keeps
  what a GraphQL subscription hears to events that committed. `LocalDelivery`, which delivered every
  destination message back to this process through the outbox's `local` transport in a service with no
  broker, is gone: such a message is no longer written, and the process's handlers are told by the bus
  like any other.
- **The event store** (`eventsourcing/`): Axon 5's, with dynamic consistency boundaries — `Tag`,
  `TagResolver`, `EventCriteria`, `ConsistencyMarker`, `AppendCondition`, an `EventStoreTransaction`
  per unit, and `EventSourcingRepository`. It replaced the event log
  (`persistence/event-log`: `EventLog`, `MikroOrmEventLog`, `EventSourcedRepository`, a stream per
  aggregate keyed by `stream_id` and `sequence`), and its storage left this library:
  `EventStorageEngine` is a port, and `MikroOrmEventStorageEngine` lives in
  `libs/core/event-store-mikro-orm`. A system migration turned the log's rows into tagged ones.
- **No database.** `TransportTenantResolver` became `MessageTenantResolver`, in `libs/database`,
  reading the envelope by its shape; the tenant of a streaming delivery is the transaction manager's to
  pick from the message's metadata; `startInProcessService` takes a schema's lifecycle as hooks
  (`testSchemaLifecycle`). `@nestposts/database` is a development dependency of this library, for its
  specs, and nothing else.

What Axon 5 has and this does not, on purpose: Axon Server (the brokers and `@nestjs/outbox` are the
transport), a streaming processor that replays from the store (a group's messages are written at
publish time and deleted once handled), and snapshots. Nor the constructs that were ported with the
rest and never used: `FullConcurrencyPolicy`, `MetadataSequencingPolicy`, `MetadataBasedTagResolver`,
`MultiTagResolver`, `SimpleCorrelationDataProvider`, and `AppendCondition.withCriteria` and
`orCriteria`. They were dropped because the port is of Axon 5's semantics, not of every class that
carries them: nothing here named one, and each class is a subclass of `SequencingPolicy`,
`TagResolver` or `CorrelationDataProvider` — a few lines — for an application that needs it, while the
unit's `EventStoreTransaction` widens its criteria and builds its `AppendCondition` without either
method.

## What this repository adds on top

Everything under `outbound/`, `inbound/`, `outbox/`, `messaging/`, `eventhandling/`, `eventsourcing/`
and `unit-of-work/`, none of which upstream has:

- **Axon 5's messaging** — the unit of work, the transaction manager port, the message model,
  correlation and interceptors, processing groups, and the event store — as described above;
- **headers of what an event is** (`message-headers.ts`, `EventMessages`): the message's metadata key
  for key — the request, the correlation, the trace, captured at dispatch because the relay publishes
  later, in no request at all — and the framework's facts beside it: a stable message type, a
  timestamp, the origin, the event's tags, its identifier and, for a streaming group's message, the
  group;
- **an address the event answers for itself** (`EventAddress`): the message type, the tags, the
  qualified name that is the outbox message's topic, and a routing key of
  `namespace.Name.sequence`, which each broker's packet — the application's — reads back off the
  message (`EventAddress.ofMessage`), so a consumer binds to the slice it wants
  (`EventAddress.everyEventOf`);
- **a route that knows the process is a destination too** (`OutboxRoute`): a namespace the outbox has
  a transport for goes through it, and a streaming group's message goes to `@nestjs/outbox`'s own
  `local` transport, where `StreamingGroupDelivery` receives it. A destination message the route would
  send `local` is not written, because nothing there receives it. It replaced a `MemoryClient` with no
  servers, which an application with no broker published through to nobody, and the client itself is
  gone: a suite delivers on `TopicMemoryServer.emit` (`@nestposts/microservices-memory`), which matches
  the bindings the way a topic exchange does;
- **one transaction per ingested message**: `EventIngestion` records the message in the inbox and
  stages the event in one unit of work, whose `PREPARE_COMMIT` appends it, writes what the streaming
  groups owe and tells the subscribing handlers — whose sagas' commands join the transaction and are
  waited for. A reaction that fails rolls the inbox row back with everything else, so the transport's
  redelivery is acted on; this replaced a "forget the inbox row after the fact" that a crash in the
  middle could skip;
- an **origin mark** on every message, which is what keeps "everything published locally leaves" and
  "everything received is published locally" from feeding each other forever;
- **request-context propagation** across the hop (`RequestContextCodec`), and `IncomingRequest`,
  which hands that request to a guard, an interceptor or a controller so a command dispatched there
  runs in it;
- **the relay's place in a process** (`OutboxRelayMode`): polling in a long-lived process, drained
  after each unit of work that staged messages in a function, and off in an API-only instance. A
  drain claims whatever of its service's messages is due, not only what its own unit staged, so what
  one drain could not publish goes out with the next unit of the same service that commits messages
  of its own; nothing comes back for it on a timer. That replaced a scheduled sweep:
  `OutboxHousekeeping` (`libs/core/outbox-mikro-orm`), which pruned the inbox, warned on the outbox's
  lag and dead letters and ran a `sweep()` that a relay function per service and the web's
  `POST /api/outbox/sweep` called every minute on AWS, is gone with those functions and their crons.
  The inbox's retention is `apps/migrator`'s now — `pruneInbox()`, at the end of every `migrate()` —
  and a dead letter's one report is `DeadLetterReporting`'s, from `@nestjs/outbox`'s
  `nestjs:outbox:dead-lettered` channel;
- **a trace across the hop** (`tracing.ts`): the trace an event was dispatched in is written into its
  metadata, and a consumer span wraps the whole unit of a delivery;
- the **doubles** that make all of the above testable with nothing running: `startInProcessService`
  (on a `TopicMemoryServer`), `RecordingClient`, `publishedEnvelope` and `InProcessPacket`;
- **the AWS and Inngest transports**, in `@nestposts/microservices-aws` and
  `@nestposts/microservices-inngest`: client proxies, strategies, contexts and record builders, which
  know nothing of this library. What stays here is what needs `@EventType`: the SNS filter policy built
  from a binding (`SnsFilterPolicy`), the routing attributes it selects on (`routingAttributesOf`),
  and `inngestTriggers`. The records placed on those transports are the applications' (see
  **What `@nestjs/outbox` does here**).
