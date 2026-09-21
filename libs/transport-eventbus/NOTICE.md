# transport-eventbus

This library is a vendored and adapted copy of
[**nestjs-transport-eventbus**](https://github.com/sergey-telpuk/nestjs-transport-eventbus) v1.0.24
by Sergey Telpuk, MIT licensed (see `LICENSE`), with an integration layer built on top of it.

## What came from upstream, unchanged in shape

The whole integration point, which is the reason this library is built on it rather than beside it:

| piece | what it does |
|---|---|
| `TransportEventBusService implements IEventBus` | **the** idea: a drop-in replacement for the CQRS `EventBus`. Everything that already publishes — a handler, a saga, an aggregate's `commit()` — publishes through the transport without a line of its code changing |
| `TransportEventBusPublisher extends EventPublisher` | so `mergeObjectContext(aggregate)` binds the aggregate to the transport bus |
| `@Publisher(...)` | a class holding a `ClientProxy` is a destination — **the only selection rule there is** |
| `@ExcludeDef()` | an event that does **not** run locally, only remotely |
| `@TransportEvent()` | the receiving side's parameter decorator: the message becomes an event again |
| `TRANSPORT_EVENT_BUS_SERVICE` / `_PUBLISHER` / `_PATTERN` | the injection tokens and the default message pattern |

Its integration test suite is ported as `src/transport-event-bus.service.spec.ts`, assertion for
assertion, and it is what proves the base still behaves the same on this stack.

## What the new versions forced

1. **`@TransportEvent()` has to rebuild the real event class.** Upstream builds an anonymous class and
   forges its `name`, because `@nestjs/cqrs` 7 matched a handler by the event's class *name*. Version
   12 does not: `@EventsHandler(SomeEvent)` stamps `{ id: randomUUID() }` on the event class itself and
   `filterEventWithId` compares that id, read off the instance's constructor. A forged class carries no
   such id, so **no handler, no saga and no subscription would match, and the event would be dropped in
   silence**. Reconstruction therefore goes through a registry of declared event types
   (`@EventType` in `@nestposts/platform`), which is also what gives the wire a name that is stable
   across processes — the random id cannot be one.
2. **`emit`, not `send`.** Upstream awaits a reply for an event (`client.send`). Over RabbitMQ that
   needs a reply queue and turns a fire-and-forget event into a request; `emit` is the transporter's
   event path.
3. **`@ExcludeDef` writes metadata instead of returning a subclass.** Upstream's decorators (it did the
   same for `@TransportType`) replace the class with a subclass carrying extra readonly fields. Here the
   domain events also carry `@AutoMap()` properties, and AutoMapper reads `design:type` metadata off the
   class it was told about — a substituted class is a class the mapper does not know.
   `Reflect.defineMetadata` on the class has the same effect for us with none of that risk.
4. **Nothing here imports `CqrsModule`.** Upstream's module does, and on version 7 that gave one
   shared instance. In 12, `CqrsModule.forRoot()` is a *dynamic, global* module of the same class, and
   a dynamic module is not the static class: importing the static one alongside these providers yields
   a second `EventBus`, whose handlers nobody registered. Every local handler, saga and subscription
   would stop being called, silently. The bus is taken from wherever the application put CQRS.
5. **The inbox is opt-in.** The outbound half needs no database — upstream has none — so
   `MessageInbox` is a port, and `EventIngestion` arrives in its own providers array
   (`eventIngestionProviders`) for the services that receive.
6. **The bus signatures follow `IEventBus` of version 12**, which takes a dispatcher context and an
   `AsyncContext`. Keeping them is what lets a request-scoped handler keep working: this application's
   command handlers are `Scope.REQUEST` and stamp their events through
   `publisher.mergeObjectContext(aggregate, request)`.

## What this repository changed in its shape

7. **There is no `TransportEventBusModule.forRoot(...)`.** Upstream's module function is how an
   application declares its destinations; here the mechanism is two arrays of providers
   (`transportEventBusProviders`, `eventIngestionProviders`) that an application spreads into a module
   of its own, and what the library needs back it asks for as an **abstract class** —
   `TransportIdentity`, `RequestContextCodec`, `IngestionSink`, `MessageInbox`. A module function is a
   second way of wiring, one that takes an options literal instead of a class and that nothing can
   substitute in a test; a binding is the way everything else in this repository is wired.
8. **The wire format lives in the transporter's own extension points, one pair per transport.**
   Upstream's bus builds the message; here the forwarder emits an `EventEnvelope` — `data`, the event,
   and `metadata`, a flat map of strings — and each transport's `EventEnvelopeSerializer` /
   `EventEnvelopeDeserializer` decides where the two halves go. On RabbitMQ that is the body and the
   AMQP headers, built with the transporter's own `RmqRecordBuilder`; in process, both in the value.
   Declaring them in the client's and the server's options is where `@nestjs/microservices` already
   asks "what actually goes on the wire", and it is what keeps the body **the event** instead of a
   base64 payload inside a wrapper.
8b. **`@TransportEvent()` is a pipe.** Upstream's parameter decorator reconstructed the event by
   itself; here the transport's deserializer produces the envelope and `TransportEventPipe` rebuilds
   the class from it, through Nest's own payload pipeline — so a controller's parameter is the typed
   domain event, extra pipes compose with it (`@TransportEvent(new ValidationPipe())`), and nothing in
   the controller parses anything. `@TransportRequest()`, which upstream has no equivalent of, is the
   same idea for the request the message belongs to: a pipe that is a provider, because decoding it is
   the application's `RequestContextCodec`'s job.
9. **`@TransportType` is gone: the event's namespace is the selection.** Upstream's decorator made each
   event name the transports it may leave through, and `@Publisher(id)` matched that id. But an event
   already declares `@EventType({ namespace })`, because that is its identity on the wire
   (`posts.PostCreated#2.0.0`) — so naming destinations as well was the same fact written twice, in two
   places to keep in step, and it put a deployment detail inside a domain event: `libs/posts` had to
   import this library to say it. Now a destination declares the namespaces it takes
   (`@Publisher('posts')`, `@Publisher(['posts','tags'])`, or `@Publisher(EVERY_NAMESPACE)` for
   upstream's "one bus, everything" mode), the event declares only what it **is**, and `libs/posts`
   depends on nothing but the platform. What an event still says about publishing is `@ExcludeDef()`,
   which is about this process and not about a destination.
10. **The in-process transport is mostly not ours.**
    [`MemoryServer`](https://github.com/camcima/nestjs-memory-microservices) is the receiving half, so
    a spec goes through the controllers Nest wrapped; `MemoryClient` adds the two things a topic
    exchange has and that package does not — a `ClientProxy` and pattern matching.

## What this repository added on top

Everything under `outbound/`, `inbound/` and `persistence/`, none of which upstream has:

- an **envelope** of two halves — the event as the application wrote it, and a flat map carrying a
  stable message type, an identifier, a timestamp, the origin, the event's tags and the request —
  instead of `{ payload, eventName }`;
- **routing by namespace** (`OutboxRouting`): which destination takes which event, so a service can have
  more than one, on more than one protocol, with the events naming none of them;
- **addressing per transport** (`ChannelAddressing`): a RabbitMQ topic routing key of
  `namespace.Name.aggregateTag`, so a consumer binds to the slice it wants;
- an **inbox** table: one row per received message, in the same transaction as the work it caused,
  which is what makes an at-least-once delivery safe to receive;
- an **event store** (`persistence/event-store`): the stream of an aggregate, the sink that appends
  every ingested event to it, and a generic `EventSourcedRepository` that replays it. It is here and not
  in an application because a service that decides about an aggregate it has no table for needs exactly
  this, always in the same shape — the Axon side gets it from its framework's event store, and a
  service that had to write it would be writing the framework once per service;
- an **origin mark** on every message, which is what keeps "everything published locally is forwarded"
  and "everything received is published locally" from feeding each other forever;
- **request-context propagation** across the hop (`RequestContextCodec`), and `@TransportRequest()`,
  which hands that request to a controller so a command dispatched there runs in it;
- **a binding for a whole namespace** (`everyEventOf`): one `@EventPattern`, every event of the
  namespace, each answered as the class it is — which is what a service that keeps another's stream
  needs, and what a list of per-type bindings silently gets wrong as the other side grows;
- the **doubles** that make all of the above testable with nothing running: `MemoryClient`,
  `startInProcessService`, `RecordingClient` and `RecordingAddressing`.
