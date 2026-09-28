# @nestposts/transport-eventbus

**Axon Framework 5's messaging on `@nestjs/cqrs` and `@nestjs/outbox` — the CQRS event bus, speaking
through Nest's microservice transports.**

A domain event raised inside a command handler is a message of that command's **unit of work**. The
unit stages it, and in its `PREPARE_COMMIT` phase — inside the transaction of the work that raised it —
appends it to the event store, writes it to [`@nestjs/outbox`](https://github.com/nestjs/outbox) for
whatever has to hear it later (another service, a streaming processing group), and tells this
process's subscribing handlers. The transaction commits, and only then does the outbox's relay
publish. Nothing in the domain or in the handlers has to know: the integration point is `IEventBus`
itself, and a handler written for `@nestjs/cqrs` stays one.

The library began as a vendored copy of
[nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus) by Sergey
Telpuk (MIT). `@nestjs/outbox` then took over the publishing and the remembering, and the unit of
work, the messages, the event processors and the event store were ported to Axon 5's semantics.
[`NOTICE.md`](./NOTICE.md) is the account of what came from where and why; this file is how to use
it, and **Axon 5 → this library**, near the end, is the table to read when a name looks borrowed —
it is.

| | |
|---|---|
| the unit of work | every command, every ingested message and every streaming delivery runs in one: Axon 5's `UnitOfWork`, its phases (`PRE_INVOCATION` … `AFTER_COMMIT`) and its `ProcessingContext`, in the transaction the application's `TransactionManager` opens |
| publishing | `TransportEventBusService` (an `IEventBus`, Axon's `EventSink`) stages each event as an `EventMessage` → `PREPARE_COMMIT`: the event store appends, `EventOutbox` writes the outbox rows, `LocalEventDelivery` tells the subscribing handlers → `COMMIT` → the outbox's relay → the namespace's `ClientProxyTransport` → your `ClientProxy`, carrying the transport's own record (`OutboxPackets`) |
| receiving | the transport's own deserializer → your `@EventPattern` controller, `@Payload() envelope: OutboxEnvelope` → `EventIngestion.ingest(envelope)` → one unit of work: the `OutboxInbox` row, then the event staged like any other |
| event processing | processing groups, **subscribing** (told in `PREPARE_COMMIT`, inside the transaction; a failure fails the unit) or **streaming** (a message of the group's own in the outbox, delivered after the commit in a unit of its own, retried and dead-lettered by `@nestjs/outbox`) |
| the event store | tags instead of streams, and a decision appended on condition that nothing it read has changed — Axon 5's dynamic consistency boundary, on the application's `EventStorageEngine` |
| what crosses | `@nestjs/outbox`'s `OutboxEnvelope` — `id`, `topic`, `key`, `headers` (the message's metadata), `createdAt`, `payload` — as the `data` of Nest's own `{ pattern, data }` |
| what keeps it once | on the way out, the outbox: the row commits with the work, and the relay retries it until a broker takes it. On the way in, the origin mark, the inbox, and your aggregate or the event store's append condition |

**The library knows no database.** The transaction manager, the storage engine, the outbox store and
the tenant resolver are the application's — `@nestposts/outbox-mikro-orm`,
`@nestposts/event-store-mikro-orm` and `@nestposts/database` in this repository — and it depends on
none of them: `@nestposts/database` is a development dependency, for its specs, and nothing else.
What the library needs from the application it asks for as options, and a port it defines
(`TransactionManager`, `EventStorageEngine`) is satisfied by its shape.

---

## Quick start

### 1. Give the event a name on the wire

```ts
import { EventType } from '@nestposts/platform/domain/shared/event-type';

export const POSTS_NAMESPACE = 'posts';

@EventType({ namespace: POSTS_NAMESPACE, tags: ['postId'] })
export class PostPreCreatedEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
    readonly occurredAt: Date,
  ) {}
}
```

That is **all** an event declares, and the import is the platform's: nothing in the domain knows this
library exists.

`namespace.Name#version` — `posts.PostPreCreated#1.0.0` — is the event's `MessageType`, its identity
outside this process. `name` defaults to the class name without the `Event` suffix, `version` to
`1.0.0`.

The **namespace is also the route**: the outbox's destinations are keyed by namespace, and that is
the whole routing (step 3). An event whose namespace has no destination stays in this process, which
is the right default for the events a domain is mostly made of — and so does an event with no
`@EventType`, which has no namespace at all. The qualified name, `posts.PostCreated`, is the outbox
message's `topic`.

`tags` names the properties that say **what the event is about** — Axon 5's `Tag`, `postId=9f1d…`.
They do three jobs:

- the **event store** files the event under every one of them, and a decision reads the events that
  carry the tags it cares for (see **The event store**);
- the default **sequencing policy** orders by the first tag, so one post's events are published and
  handled in the order they committed while two posts proceed side by side — which is the outbox
  message's `key`, SNS's message group, and the routing key's last segment;
- the other side knows what the event belongs to.

An event may carry more than one tag: `StudentEnrolled` is about a course **and** a student. The
tags are sorted by key, and the default policy sequences by the first of them, with a warning each
time — an event about two entities can be ordered by one of them only, and which one is a decision a
`SequencingPolicy` can take instead (**Sequencing**, below).

### 2. Start it

The bus stands on things it does not declare: `@nestjs/cqrs` — here through `CqsrsModule` —
`@nestjs/outbox` with a store behind it, and, for a service that event-sources, a storage engine. The
application declares them at its root, and the bus uses them:

```ts
import { Module } from '@nestjs/common';
import { OutboxModule } from '@nestjs/outbox';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, MessageTenantResolver, TenancyModule } from '@nestposts/database';
import {
  MikroOrmEventStorageEngine,
  MikroOrmEventStoreModule,
} from '@nestposts/event-store-mikro-orm';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmTransactionManager,
} from '@nestposts/outbox-mikro-orm';
import {
  OutboxRoute,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
} from '@nestposts/transport-eventbus';

const transports = PostEventsClient.destinations(appConfig());

@Module({
  imports: [
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRootAsync({ /* the connection */ }),
    TenancyModule.forRoot({ resolver: MessageTenantResolver, migrations }),
    OutboxModule.forRoot({                                   // @nestjs/outbox, global — step 3
      imports: [PostEventsClientModule],
      transports,
      route: OutboxRoute.over(transports),                  // a streaming group, or a namespace with no transport, goes `local`
      relay: { enabled: true },
    }),
    MikroOrmOutboxModule.forRoot({ producer: 'tagging' }),  // its store and its three tables
    MikroOrmEventStoreModule,                                // the event store's table and engine
    TransportEventBusModule.forRoot({
      identity: 'tagging',                                   // or a TransportIdentity of its own
      transactionManager: MikroOrmTransactionManager,        // what every unit of work runs in
      inbox: { descriptions: MikroOrmOutboxStore },          // receiving on
      outbox: {                                              // publishing beyond this process on
        destinations: PostEventsClient.namespaces,
        useFactory: () => ({ relay: 'poll', route: OutboxRoute.over(transports) }),
      },
      eventStore: {
        engine: MikroOrmEventStorageEngine,
        entities: [{ entity: Post, tagKey: 'postId' }],
      },
    }),
    PostEventsClientModule,
  ],
})
export class AppModule {}
```

| option | default | |
|---|---|---|
| `identity` | required | who this service is on the wire: a name, or a `TransportIdentity` (`.silent('my-suite')` for a spec) |
| `publishes` | `true` | the master switch of the outbound half, when the identity is a plain name |
| `transactionManager` | none | **the transaction every unit of work runs in** — Axon 5's `TransactionManager`, for the application's ORM: `MikroOrmTransactionManager`. The outbox, the inbox and the event store write through it. Without one every write commits on its own (`NoTransactionManager`), which a service with no inbox, no outbox and no event store can afford and one with any of them cannot |
| `requestContext` | `DefaultRequestContextCodec` | what `@nestjs/cqrs`'s request means here, both ways — see **The request** |
| `correlationDataProviders` | `[MessageOriginProvider, ForwardedMetadataProvider]` | what a handled message passes on to everything its handler dispatches |
| `dispatchInterceptors` | `[]` | run on every message as it is dispatched, after the correlation data and the trace |
| `handlerInterceptors` | `[]` | run around every message as it is handled, inside the correlation data's branch |
| `tagResolver` | `AnnotationBasedTagResolver` | which tags an event carries: by default, what `@EventType({ tags })` declares |
| `sequencingPolicy` | `DefaultSequencingPolicy` | which events are published and handled in order: per entity, and every untagged event in one sequence |
| `processingGroups` | `{}` | the groups that are not the default — subscribing, with a propagating error handler: `{ notifications: 'streaming' }` |
| `inbox` | none | `true`, or `{ descriptions }`, turns **receiving** on: `EventIngestion`, which admits each message through the application's `OutboxInbox`, keyed by this service's name and the envelope's id. `descriptions` is where each message's type and origin are noted beside it (`InboxDescriptions`) |
| `outbox` | none | turns **writing to the outbox** on: `destinations`, the namespaces this service publishes, and the settings (`inject` + `useFactory`, answering `TransportOutboxSettings` — the relay mode and the root's `route`). Without it nothing leaves the process, and no processing group can be streaming |
| `eventStore` | none | `{ engine, entities }`: the `EventStorageEngine` (a provider some module exports, `MikroOrmEventStorageEngine`), and an `EventSourcingRepository` per entity listed. Every event a unit publishes or ingests is appended |
| `subscriptions` | none | the `EventBus`'s observable side reads the event store — see **Subscriptions across processes**. It needs `eventStore` |
| `imports` / `providers` / `exports` | `[]` | whatever the above depend on |

Two combinations are refused at boot, with a message that names the fix: a streaming processing group
declared at the root without an `outbox` (it is delivered through the outbox), and `subscriptions`
without an `eventStore` (they read it).

`forRootAsync` is the same with the identity resolved at runtime — from the application's
configuration, a secret, a discovery agent. Every application here builds it, and the outbox around
it, from its `registerAs` configs:

```ts
OutboxModule.forRootAsync({
  imports: [PostEventsClientModule],
  transports: PostEventsClient.destinations(appConfig()),
  inject: [appConfig.KEY, outboxConfig.KEY],
  useFactory: (app: AppConfig, { relay, pollInterval, retry }: OutboxConfig) => ({
    route: PostEventsClient.route(app),                    // OutboxRoute.over(PostEventsClient.destinations(app))
    relay: { enabled: relay === 'poll', pollInterval },
    retry,
  }),
}),
MikroOrmOutboxModule.forRootAsync({
  inject: [appConfig.KEY],
  useFactory: ({ name }: AppConfig) => ({ producer: name }),
}),
TransportEventBusModule.forRootAsync({
  inject: [appConfig.KEY],
  useFactory: ({ name, publishes }: AppConfig) => TransportIdentity.named(name, { publishes }),
  transactionManager: MikroOrmTransactionManager,
  inbox: { descriptions: MikroOrmOutboxStore },
  outbox: {
    destinations: PostEventsClient.namespaces,
    inject: [appConfig.KEY, outboxConfig.KEY],
    useFactory: (app: AppConfig, { relay }: OutboxConfig) => ({
      relay,
      route: PostEventsClient.route(app),                  // the root OutboxModule's route, the same one
    }),
  },
  requestContext: PostRequestContextCodec,
  processingGroups: { notifications: 'streaming' },
}),
```

Only the identity is async, and that is not a limitation: everything else is a class or a provider,
and a provider resolves its own dependencies — the outbox's settings are an ordinary `useFactory` with
an `inject`. What cannot wait is module metadata, which Nest reads before anything is instantiated,
and the root `OutboxModule`'s `transports` are module metadata: it has to know them to build them.
That is why the applications compute them by calling their config factory, `appConfig()`, the way
`CLAUDE.md` says a value needed before the container exists is read.

Six things to know:

- **The identity is the mark of authorship, not an address.** Where a message goes is its
  namespace's destination; the name is what every message carries *from* this service
  (`cqrs-transport-origin`), what this service's inbox rows are kept under (the consumer), and — as
  the store's `producer` — what its outbox rows are kept under. A service that binds a namespace it
  also publishes to receives its own events, and without the mark it ingests them, writing its own
  state again and deciding twice. Two services must not share it — they would swallow each other's
  events, share one memory of what was ingested and relay each other's outbox — and there is no
  default because a wrong name is worse than a missing one.
- **The outbox is used, never configured, here.** The bus injects `Outbox`, `OutboxRelay` and
  `OutboxInbox` from the global `OutboxModule` the application declared. It cannot `imports:
  [OutboxModule]` instead: the bare class is a second, unconfigured instance of a module whose
  providers need its options. An `inbox` or an `outbox` without the root `OutboxModule` fails the
  boot, naming the provider it could not resolve.
- **The tables come with the modules that own them, and none of them is this library's.**
  `MikroOrmOutboxModule` brings `@nestjs/outbox`'s three (`outbox_messages`, `outbox_dead_letters`,
  `outbox_inbox`) and `MikroOrmEventStoreModule` the event store's (`event_log`), each through
  `DatabaseModule.forFeature`. A service with neither an outbox nor an event store needs no database
  at all, and publishes to nobody but itself.
- **Every unit of work is a transaction.** `transactionManager` binds the `TransactionManager` port to
  the application's implementation, and every unit the module's `UnitOfWorkFactory` creates —
  every command, every ingested message, every streaming delivery — begins it in `PRE_INVOCATION`
  and commits it in `COMMIT`: what the handlers flush, the event store's append and the outbox rows
  commit together or not at all. `TransactionManager.handleOf(context)` is the transaction's handle,
  and it is what `Outbox.add(tx, …)`, `OutboxInbox.processInTransaction(tx, …)` and the storage
  engine receive.
- **Nothing imports `CqrsModule`**: the `EventBus` and the `CommandBus` come from wherever your
  application put CQRS. `CqrsModule.forRoot()` and `CqsrsModule.forRoot()` are global, so that is
  enough — and importing the static `CqrsModule` inside a provider's module would give it a *second*
  `EventBus`, which fails silently (see `NOTICE.md`).
- **The module is global**, because what it provides is injected from everywhere: a command handler
  asks for `TRANSPORT_EVENT_BUS_PUBLISHER`, a controller for `EventIngestion`, a guard for
  `IncomingRequest`, an on-demand notification for `UnitOfWorkFactory`.

### 3. Declare where the events go out

A destination is `@nestjs/outbox`'s own `ClientProxyTransport` around a client, keyed by the namespace
whose events it carries, with the packet of its transport. The client declares its namespaces once:
`destinations()` is what the root `OutboxModule` takes as `transports`, and `namespaces` is what the
bus is told as `outbox.destinations`:

```ts
export class PostEventsClient {
  static readonly namespaces = [POSTS_NAMESPACE, NOTIFICATIONS_NAMESPACE];

  static destinations(app: AppConfig): Record<string, Type<OutboxTransport>> {
    if (app.transport === 'memory') {
      return {};                                        // no broker: nothing leaves the process
    }
    const transport = ClientProxyTransport(PostEventsClient, {
      toPacket: OutboxPackets.for(app.transport),       // 'rabbitmq' | 'aws' | 'inngest'
    });
    return Object.fromEntries(
      PostEventsClient.namespaces.map((namespace) => [namespace, transport]),
    );
  }

  static route(app: AppConfig): OutboxRouteFunction {
    return OutboxRoute.over(PostEventsClient.destinations(app));
  }
}
```

and the client itself is ordinary Nest, provided by a module of its own — with no serializer, because
the transport's default one sends what `toPacket` built:

```ts
@Module({
  providers: [
    {
      provide: PostEventsClient,
      inject: [rabbitmqConfig.KEY],                     // the application's registerAs('rabbitmq')
      useFactory: ({ urls }: RabbitmqConfig) =>
        ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls,
            exchange: 'nestposts.events',
            exchangeType: 'topic',
            wildcards: true,      // this is what makes the pattern BE the routing key
            persistent: true,
          },
        }),
    },
  ],
  exports: [PostEventsClient],
})
export class PostEventsClientModule {}
```

**The client module is imported twice, and both are needed.** `ClientProxyTransport(PostEventsClient,
…)` is a class that `OutboxModule` instantiates **inside itself**, so the client has to resolve there:
that is the root `OutboxModule`'s `imports`. The application imports the same module again for
whatever else injects it — in the applications here the `Inngest` client, which the inbound strategy
serves functions from and the proxy sends through. A static module is one instance however many
modules import it, so the relay publishes through the same client the rest of the application sees.

**The route is the event's.** The outbox's `route` is `OutboxRoute.over(transports)`, which reads the
namespace off the message type the event declared and picks the destination under that key. There is
no class naming which events go where, so there is no second declaration to keep in step with the
first: a new event in a namespace that already has a destination goes out routed, with nothing added
anywhere. Two namespaces through one broker are two keys holding the same transport. One namespace is
one route, so the same namespace on two brokers is not something this map can say — fan-out of that
kind is the broker's.

**The route answers `local` twice, for two different reasons.** `local` is `@nestjs/outbox`'s own
in-process transport: the relay hands a message to the `@OnOutboxMessage()` handlers of this process,
matched by exact topic.

- A message for a **streaming processing group** always goes `local` — its header
  `cqrs-transport-processing-group` says so — and `StreamingGroupDelivery`, which the module declares
  on the groups' one topic, `@processing-group`, delivers it (**Processing groups**, below).
- A **destination message whose namespace has no transport** — a service running with no broker,
  `POSTS_TRANSPORT=memory` — would go `local` too, where nothing receives it. So it is **not written
  at all**: the bus is told the same route in `outbox.useFactory`, asks it about each destination
  message before staging it, and leaves out what would only reach `local` and be dead-lettered there.
  The event still reaches this process's handlers, the way every event does — in `PREPARE_COMMIT`,
  from the bus, not from the outbox.

Without the route in the bus's settings every destination message is written, which is right for a
service whose every namespace has a transport and wrong for one with no broker.

**The code says what goes out; the configuration says where.** The namespaces are in the code and the
factory says which broker that is, so what a service publishes is its contract rather than an
environment variable.

### 4. Make it the application's publisher, and publish

Nothing changes in how you raise events. What changes is what `EventPublisher` **is** — one line, in
the module that sets CQRS up:

```ts
CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER })   // or CqrsModule, see below
```

From there a handler injects the obvious thing and gets the right one:

```ts
@CommandHandler(CreatePost, { scope: Scope.REQUEST })
export class Handler implements ICommandHandler<CreatePost> {
  constructor(
    private readonly posts: PostRepository,
    private readonly publisher: EventPublisher,
    @Inject(REQUEST) private readonly request: AsyncContext,
  ) {}

  async execute(command: CreatePost): Promise<void> {
    const post = this.publisher.mergeObjectContext(
      Post.create(/* … */),
      this.request,                 // the request that opened this, stamped on every event raised
    );
    await this.posts.save(post);
    post.commit();                  // staged: appended, written and told in the unit's PREPARE_COMMIT
  }
}
```

> **Without that binding**, a handler that injects `EventPublisher` gets Nest's own: it still works,
> and its events silently never leave. That is the one mistake this wiring can make, which is why the
> substitution belongs in the composition root rather than in every handler's constructor — and why
> `@nestposts/cqsrs` asserts, in both module shapes, which publisher a handler actually receives.
> An application on the plain `CqrsModule` has no such option: it injects
> `@Inject(TRANSPORT_EVENT_BUS_PUBLISHER)` in each handler, or binds `EventPublisher` itself in the
> modules its handlers live in.

To publish without an aggregate, inject the bus:

```ts
constructor(private readonly eventBus: TransportEventBusService) {}

await this.eventBus.publish(event);                 // inside a unit: staged, resolves at once
await this.eventBus.publish(event, this.request);   // with the request attached
```

Inside a unit of work — a command handler, a saga's command, an ingestion, a streaming delivery —
`publish` stages and resolves at once, and the unit's own promise covers the rest. Outside one it gets
a unit of its own (**Outside any unit of work**, below). Once a unit is past `PREPARE_COMMIT`,
publishing in it **throws**, as it does in Axon: its events would be told after the unit had already
written what it publishes.

### 5. Receive on the other side

A microservice — on its own (`NestFactory.createMicroservice`) or alongside HTTP — with nothing of
this library in its options: the transport's default deserializer already hands a handler `{ pattern,
data }`, and `data` is the envelope.

```ts
const app = await NestFactory.create(AppModule);
const { urls } = app.get<RabbitmqConfig>(rabbitmqConfig.KEY);   // the application's registerAs('rabbitmq')
app.connectMicroservice<MicroserviceOptions>(
  {
    transport: Transport.RMQ,
    options: {
      urls,
      queue: 'nestposts.posts-api.post-completed',   // one queue per SERVICE
      queueOptions: { durable: true },
      exchange: 'nestposts.events',
      exchangeType: 'topic',
      wildcards: true,
      noAck: false,
    },
  },
  { inheritAppConfig: true },
);
await app.startAllMicroservices();
await app.listen(3000);
```

and a controller, binding either one event type or a whole namespace:

```ts
@AllowAnonymous()          // a message carries no session; the global guard would answer UNAUTHORIZED
@Controller()
export class PostEventsController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))    // posts.#  — every event of the namespace
  posts(@Payload() envelope: OutboxEnvelope): Promise<void> {
    return this.ingestion.ingest(envelope);
  }
}

@Controller()
export class PostCompletionController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(PostCreatedEvent))   // posts.PostCreated.*  — one type, any entity
  postCompleted(@Payload() envelope: OutboxEnvelope): Promise<void> {
    return this.ingestion.ingest(envelope);
  }
}
```

**One entry can serve a whole namespace**, and often should: the message type in the envelope's
headers is what resolves the concrete class, so one method receives every event of `posts` as the
class it is. A service that keeps another's history wants exactly that — a binding per event type is a
list that has to grow every time the other service adds one, silently, because an event nobody bound
to is dropped by the exchange without a word. The cost is that the queue also receives what this
service does not act on, including its own events, which the origin mark drops before the inbox.

**The parameter is the envelope, and the ingestion rebuilds the event.** `@Payload()` is Nest's own,
which is `@nestjs/outbox`'s consumer pattern: the controller parses nothing. `EventIngestion` checks
what it was handed is an `OutboxEnvelope` (`envelopeOf`), reads it back as the `EventMessage` it was
published as (`EventMessages.read`: the payload an instance of its real class, dates included, under
the identifier it was raised with, the headers split into the framework's facts and the metadata),
and marks the payload with where it came from. A payload that is not an envelope — a producer that is
not an outbox, a transport whose deserializer changed the shape — is refused by name, rather than
skipping the inbox.

**`IncomingRequest.from(envelope)` is the other half**: the `AsyncContext` the message belongs to,
rebuilt from its metadata by the application's `RequestContextCodec`. A controller that dispatches
instead of ingesting passes it on, and the command runs in the request that opened it on the other
side of the wire:

```ts
constructor(private readonly incoming: IncomingRequest, private readonly commandBus: CommandBus) {}

@EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))
posts(@Payload() envelope: OutboxEnvelope): Promise<void> {
  const { payload } = EventMessages.read(envelope);
  return this.commandBus.execute(new CompletePost(payload), this.incoming.from(envelope));
}
```

A controller that hands the envelope to `EventIngestion` does not need it: the delivery publishes the
event under the same context, so the handlers, the sagas and the commands those sagas dispatch are
already in that request.

The ingested event reaches the **local** `EventBus`, so `@EventsHandler`, `@Saga` and the GraphQL
subscriptions see it exactly as if a local command had raised it.

**One queue per service is not a preference.** On RabbitMQ a copy is made per bound queue, not per
consumer: two applications sharing a queue compete for the messages, and whichever discards one
acknowledges it — killing it for the other.

---

## The unit of work

Every piece of work that handles a message runs in a `UnitOfWork` (`unit-of-work/`), which is Axon 5's
`UnitOfWork` with Axon 5's rules. A command gets one from `UnitOfWorkCommands`, an ingested message
from `EventIngestion`, a streaming delivery from `StreamingGroupDelivery`, and your own code from the
`UnitOfWorkFactory` the module exports.

### Its phases

A unit runs its phases in order, and the handler is one action among the others:

| phase | order | what happens there |
|---|---|---|
| `PRE_INVOCATION` | -10000 | the transaction begins |
| `INVOCATION` | 0 | the handler runs; whatever it publishes is staged |
| `POST_INVOCATION` | 10000 | whatever must see the handler's result before anything is written |
| `PREPARE_COMMIT` | 20000 | what must be durable is written — the event store, the outbox — and the subscribing handlers are told, inside the transaction |
| `COMMIT` | 30000 | the transaction commits |
| `AFTER_COMMIT` | 40000 | whatever may only happen once everything is durable: the relay is woken, the subscriptions hear the events |

The orders are Axon's and they are spaced on purpose: a phase of your own is `{ name: 'audit', order:
25000 }`, and it runs after `PREPARE_COMMIT` and before `COMMIT`. Two phases with the same order run as
one.

```ts
await units.create().executeWithResult(async (context) => {
  context.on({ name: 'audit', order: 25000 }, () => audit.record(context));
  context.onAfterCommit(() => metrics.increment('posts.completed'));
  post.complete(tags, now);
  post.commit();
});
```

`executeWithResult(action)` registers `action` in `INVOCATION` and answers what it answered **once the
whole unit — the commit included — has succeeded**. `execute()` runs a unit whose actions were
registered by hand. A unit runs once: a second `execute()` throws.

### The lifecycle's rules

They are Axon's, and each one exists because the alternative loses work in silence:

- **An action may only be registered for a phase after the one running now.** Registering for the
  running phase or an earlier one throws — it would never run. `accepts(phase)` asks first.
- **The actions of one phase all start before any finishes**, and the phase is over when all of them
  are — unless the unit is `sequential` (Axon's same-thread invocation), which a transaction manager
  whose transaction is one connection asks for: MikroORM's is, and every unit runs its phase actions
  one at a time.
- **An action that fails ends the unit.** The rest of that phase still finishes, no later phase runs,
  the first failure is what `execute` rejects with, and any later failure of the same phase is kept on
  it as `suppressed`. Every `onError` action is told which phase failed and why.
- **`whenComplete` runs only when every phase succeeded; `doFinally` runs either way.** What those
  two throw is logged and **never changes the outcome** — a completion action is not a place to fail a
  unit that already committed. One registered after the unit ended runs at once.
- **`isCommitted()` is `false` during `COMMIT` and `AFTER_COMMIT`**, as in Axon: it answers whether
  every phase ran, not whether the transaction did.

### The processing context and its resources

`ProcessingContext` is the context a unit's actions run in: its phases, and the resources the unit
holds. Whatever a component must remember for the length of one unit — the events it staged, the
transaction it opened, the event store's condition — it keeps there, under a `ResourceKey` of its own:

```ts
static readonly QUEUE = new ResourceKey<EventMessage[]>('EventQueue');

const queue = context.computeResourceIfAbsent(Bus.QUEUE, () => []);
```

**A key is its identity, not its label.** Two keys with the same label are two keys: a component that
declares its key once, as a static, cannot have its resource read or overwritten by anybody guessing a
name. The next unit starts empty — nothing is global.

**A branch differs in one resource and shares everything else.** `context.withResource(key, value)`
answers a context that holds `value` under `key` and delegates every other resource, and every phase
action, to the context it branches. That is how the message being handled reaches what it sets off
without anybody passing it along: a subscribing handler is invoked in a branch holding its event, its
correlation data and its delivery scope, and a command a saga dispatches there is stamped from them.

**`ProcessingContext.current()` is a carrier, never a join.** In Axon a context is an explicit
parameter of every call. `@nestjs/cqrs` has no parameter to put it in — `execute(command)`,
`handle(event)` — so here it travels in an `AsyncLocalStorage`, and `current()` answers it. That is
the only thing the storage is for: a unit started inside another is a unit of its own, and it is
started **outside** the current context on purpose (`ProcessingContext.runOutside`), so nothing of the
dispatcher's unit leaks into it.

### One message, one unit: nothing joins

Every command gets a unit of **its own**, whoever dispatched it — which is what Axon 5's
`SimpleCommandBus` does: `unitOfWorkFactory.create(command.identifier())` around the handler, for
every command. `UnitOfWorkCommands` is that, decorating the one `CommandBus` there is:

```
commandBus.execute(command, request)
  the command becomes a CommandMessage: what the request stands for, and — through the dispatch
  interceptors — the correlation data of the message being handled where it was dispatched
  a new unit of work, given that message, runs the handler behind the handler interceptors
  PREPARE_COMMIT  what the handler published is appended, written to the outbox, told
  COMMIT          the transaction commits — or, dispatched inside another unit's transaction, joins it
  AFTER_COMMIT    the relay is woken, the subscriptions hear the events
execute resolves with the handler's answer, once all of that succeeded
```

**What crosses from a dispatcher to what it dispatches is correlation data, not the unit.** A command
a saga sends because of an event is caused by that event — its metadata says so
(`correlationId`, `causationId`) — and is still a unit of its own, with its own phases, its own staged
events and its own `executeWithResult`.

**Two units may share one database transaction**, and that is the transaction manager's decision, not
the unit's: a command dispatched while another unit's transaction is open — a saga reacting inside an
ingestion — joins that transaction as a savepoint, which is what Axon's JPA manager does when the
thread's transaction is already active (**Transaction managers**, below).

**The delivery waits for the saga's command.** `@nestjs/cqrs` dispatches a saga's commands into the
void, and in a function the handler returning is the container freezing — measured: before the unit
of work existed, the deployed log ended one line after `was born untagged — completing it`. So the
delivery that told the saga keeps a `DeliveryScope` in its branch of the context; every handler it
invokes and every command a saga dispatches in it is **tracked** there, and the delivery settles
before its phase is over. A tracked command that fails is its group's failure, and the group's error
handler decides what that means — by default, the unit that published fails too.

### A unit of your own

Anything that is not a command, an ingestion or a delivery and wants the same guarantees asks the
factory:

```ts
@Injectable()
export class PublishingOnDemandNotifications extends OnDemandNotifications {
  private readonly units: UnitOfWorkFactory;

  constructor(
    private readonly publisher: EventPublisher,
    @Optional() units?: UnitOfWorkFactory,
  ) {
    super();
    this.units = units ?? new SimpleUnitOfWorkFactory();
  }

  async send(notifiable: OnDemandNotifiable, notification: Notification): Promise<void> {
    await this.units.create().executeWithResult(async () => {
      const addressed = this.publisher.mergeObjectContext(notifiable);
      addressed.notify(notification);
      addressed.commit();                 // staged; written to the outbox in this unit's PREPARE_COMMIT
    });                                   // resolves once that committed
  }
}
```

Called from inside another unit — a Better Auth callback during a command — it is still a unit of its
own, which joins that unit's transaction. `UnitOfWorkFactory.detached()` is the factory whose units
never join (**detached**, below).

The fallback is written in the body, `units ?? new SimpleUnitOfWorkFactory()`, and not as a default
value on the constructor's parameter: what Nest resolves is the parameter and its metadata, and a
default beside `@Optional()` reads as a promise the injector does not make.

`TransactionalUnitOfWorkFactory` is what the module binds: it makes each unit through a delegate
(`SimpleUnitOfWorkFactory`), attaches the transaction manager to its lifecycle, runs every action in
the transaction's scope, and makes the unit `sequential` when the manager asks for it.

---

## Transaction managers

`TransactionManager` (`unit-of-work/transaction-manager.ts`) is Axon 5's, as a port. This library
knows no database: the application names the implementation for its ORM —
`transactionManager: MikroOrmTransactionManager` — and every unit the module's factory creates runs in
it.

`attachToProcessingLifecycle` is Axon's, word for word: the transaction **begins in `PRE_INVOCATION`,
commits in `COMMIT` and rolls back on any failure**. So everything a unit writes before `COMMIT` —
the handler's changes, the event store's append, the outbox's rows, the inbox's record, whatever the
subscribing handlers write — commits together or not at all.

A `Transaction` is what `startTransaction` answers, and it has Axon's two methods plus what a
JavaScript ORM needs that a thread-bound JPA transaction does not:

| | |
|---|---|
| `commit()` / `rollback()` | Axon's. `rollback` must be harmless after a commit: a failure in `AFTER_COMMIT` still runs the error actions |
| `handle` | the ORM's handle on the transaction — MikroORM's transactional `EntityManager` — which whoever writes in the unit without owning the transaction writes through: the outbox, the inbox, the event store. It is `@nestjs/outbox`'s `Tx`, and `TransactionManager.handleOf(context)` answers it |
| `run(work)` | runs `work` in the transaction's scope — MikroORM's `TransactionContext` — so what a handler injects writes through the transaction without being handed it. `TransactionalUnitOfWorkFactory` wraps every phase action with it. A JPA transaction is bound to the thread and needs no such thing |
| `afterCommit(callback)` | **queues** `callback` for once what the transaction wrote is durable. It does not run it |
| `runAfterCommit()` | runs the queue. `attachToProcessingLifecycle` registers it in the owning unit's `AFTER_COMMIT`, which runs **outside** the transaction's scope |

`startTransaction(message)` is told the message the unit handles — the unit is given it before
`PRE_INVOCATION` — so a multi-tenant manager can pick the tenant's connection by the message's
metadata, which is where Axon's multi-tenancy decides it too, before the handler runs.

### A joined transaction hands its after-commit work to the one that owns it

A command a saga dispatched inside an ingestion is a unit of its own whose transaction **joined** the
ingestion's, as a savepoint. Its `COMMIT` only releases the savepoint; what it wrote is durable when
the ingestion's transaction commits, and gone if that one rolls back. So whatever must wait for the
database — a subscription hearing the command's events, the relay being woken — cannot wait for the
command's own `AFTER_COMMIT`. `TransactionManager.afterCommit(context, callback)` queues it on the
transaction instead: a joined transaction hands its queue to the one it joined when it commits, and
drops it when it rolls back; the owning unit runs it in its `AFTER_COMMIT`. A manager whose
transactions cannot queue falls back to the unit's own `AFTER_COMMIT`.

**The queue runs after the commit, not inside it — and that was measured.** When the queue ran inside
`commit()`, it executed within the committed fork's MikroORM `TransactionContext`; a drain that
delivered synchronously to another unit then joined a transaction that no longer existed, and failed
with `Transaction is already committed` (a savepoint on a finished transaction). Queued work now runs
in `AFTER_COMMIT`, which the transaction's scope does not wrap: the unit removes its transaction before
that phase, so what runs there opens transactions of its own.

### `detached()`

The same manager, beginning a transaction of its **own** even when one is open. It is for work that
nobody awaits inside the open transaction — an `aggregate.commit()` outside any unit — which as part
of that transaction would still be running after it committed: measured, `RELEASE SAVEPOINT can only
be used in transaction blocks`, from a provisioning that published inside
`UserRepository.exclusively`. MikroORM's is `REQUIRES_NEW`.

### The rest of the port

- **`requiresSequentialInvocation`** — Axon's `requiresSameThreadInvocations`: whether everything a
  unit writes goes through one connection, so its actions must run one at a time. MikroORM's answers
  `true`.
- **`TransactionManager.from(shape)`** — an implementation that lives in a library of its own must not
  import the library that runs the units, so it satisfies the port by its shape
  (`TransactionManagerLike`: `startTransaction`, and optionally `requiresSequentialInvocation` and
  `detached`) and the module adapts it. `MikroOrmTransactionManager` is exactly that.
- **`NoTransactionManager`** — what the module uses when the application names none: every write
  commits on its own, as it happens.

---

## Messages, metadata and correlation

### A message is a payload with an identity

`messaging/` is Axon 5's message model:

| | |
|---|---|
| `Message` | an `identifier` (unique, stable — what every inbox deduplicates by), a `MessageType`, the `payload` and its `Metadata` |
| `EventMessage` | a message and the `timestamp` it happened at — the payload's `occurredAt` when it has one. It carries **no aggregate and no sequence**: what an event is about are its tags, and its place in the store is the store's business |
| `CommandMessage` | what `CommandBus.execute` makes for every command; its identifier is the identifier of the command's unit |
| `MessageType` | `namespace.LocalName#version` — `posts.PostCreated#2.0.0`. Handlers and bindings match by the qualified name, never by the version: two versions of one event are the same event told in two shapes |
| `Metadata` | an immutable map of strings. On the wire it is the envelope's `headers`, key for key |

`@nestjs/cqrs` hands a handler the payload — the event or the command instance — and not a message.
So the message travels **attached to its payload**: `EventMessage.of(event)` answers the message an
event was published as, wherever that instance goes, and a handler written for `@nestjs/cqrs` stays
one while the bus, the store and the outbox speak messages. A message with more metadata is another
message (`andMetadata`), and that one is what the payload answers from then on.

```ts
const message = EventMessage.of(event);
message.identifier;                 // what every inbox keys by
message.type.toString();            // posts.PostCreated#2.0.0
message.metadata.correlationId;     // the request it belongs to
```

### Correlation data

What a message being handled passes on to everything its handler dispatches is its **correlation
data** — Axon 5's `CorrelationDataProvider`s, merged, and stamped by `CorrelationDataInterceptor` on
every message dispatched in that handler's context:

| provider | passes on |
|---|---|
| `MessageOriginProvider` | `correlationId` — the one the handled message carries, or its own identifier when it is where the chain starts — and `causationId`, the handled message's identifier. Axon 5's keys, and its rule: a command sent from a GraphQL mutation starts a chain, and everything the chain sets off, in every service, carries that command's identifier as its correlation id |
| `ForwardedMetadataProvider` | every key the application put on the message — which is how a service in the middle of a chain carries the tenant, a locale or a feature flag onward without knowing any of them exists |

The default is both, in that order; `correlationDataProviders` replaces the list. A provider of the
application's own — a fixed list of keys, say — is a subclass of `CorrelationDataProvider` with one
method, `correlationDataFor(message)`.

`ForwardedMetadataProvider` leaves three families out, and none of them by taste. **The framework's
own keys** (`cqrs-transport-*`): re-emitting the origin would publish this service's decisions under
the previous service's name, the far side would read its own name on them and drop them as its echo,
and the saga would stop dead with every message still flowing — `tagging.spec` caught exactly that.
**The trace** (`traceparent`, `tracestate`, `baggage`): what this service dispatches is a child of
what it is doing now, not a sibling of what it received. And **the origin's two ids**, which
`MessageOriginProvider` writes for this hop.

**Correlation data wins** over a key the dispatcher set itself, as in Axon. A provider that throws is
skipped with a warning, and the others still answer.

On the wire, the two ids are `correlationId` and `causationId`. A producer that still wrote the keys
this library used before it took Axon's names, `cqrs-transport-correlation-id` and
`cqrs-transport-causation-id`, is **read** as if it said the new ones (`LEGACY_CORRELATION_ID`,
`LEGACY_CAUSATION_ID`) — `tagging.spec` has a message staged that way — and nothing writes them any
more.

### The request

`AsyncContext` is `@nestjs/cqrs`'s request: the object a `Scope.REQUEST` handler is resolved in, the
one `PostRequest.of(event)` answers. It is process-local — it holds a `ContextId` the injector
understands and nothing outside does — so what travels is **what it stands for**, as metadata. In
Axon 5 the metadata *is* the request; `RequestContextCodec` is where the two meet, both ways:

- `toMetadata(context)` — what an `AsyncContext` stands for, as metadata. An event raised under one
  (`mergeObjectContext(aggregate, request)`) and a command dispatched with one
  (`commandBus.execute(command, request)`) carry it.
- `fromMessage(message)` — the `AsyncContext` a message is handled under, rebuilt from its metadata.

`DefaultRequestContextCodec` turns a context's `toAttributes()` into metadata, and a message into the
application's own context when it knows how to rebuild one — else a `TransportRequestContext`, which
wraps the message (`.metadata`) and hands onward only the application's keys. An application with a
request of its own overrides `contextFor`:

```ts
export class PostRequest extends AsyncContext implements ContextAttributes {
  constructor(readonly postId: PostId, readonly tenantId: string = ROOT_TENANT) { super(); }

  toAttributes(): Record<string, string> {
    return { 'post-request-post-id': this.postId.value, 'x-tenant': this.tenantId };
  }
}

@Injectable()
export class PostRequestContextCodec extends DefaultRequestContextCodec {
  protected override contextFor(message: Message): AsyncContext | undefined {
    const postId = message.metadata['post-request-post-id'];
    return postId
      ? new PostRequest(PostId.parse(postId), Tenant.normalize(message.metadata['x-tenant']))
      : undefined;
  }
}
```

**Correlation and causation are not the codec's.** They are the unit of work's, stamped by
`CorrelationDataInterceptor` from the message being handled, as in Axon — which is why a codec of
the application's cannot break the chain by forgetting them.

Publish with the request, and on the other side `PostRequest.of(event)` answers exactly as it does
here — which is what makes a choreographed saga one request instead of several. The metadata is
captured when the event is **dispatched**, not when the relay publishes it: by then there is no
request to encode, which is why the headers are the outbox row's and not the relay's.

### Who sees the request on the far side

| | sees it as | when |
|---|---|---|
| a **guard**, an interceptor, a filter | `IncomingRequest.of(context)` | before the handler — which is the point: a shared guard reads the tenant or the session off a message the way it reads them off an HTTP request |
| the **controller**, dispatching itself | `IncomingRequest.from(envelope)` | with the envelope in hand |
| an `@EventsHandler`, a `@Saga` | `MyRequest.of(event)` | the delivery publishes the event under the context the codec rebuilt |
| a **`Scope.REQUEST` command handler** | `@Inject(REQUEST)` | the saga passes the context on (`AsyncContext.merge(event, command)`), and the handler resolves in it |
| anything in a unit of work | `Message.fromContext(ProcessingContext.current())` | the message being handled, metadata and all |

```ts
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly incoming: IncomingRequest) {}

  canActivate(context: ExecutionContext): boolean {
    const request = this.incoming.of(context);
    return request instanceof ShopRequest && this.tenants.allows(request.tenantId);
  }
}
```

A guard runs before any pipe, so it reads the request through `IncomingRequest`, the same decode
reachable from the `ExecutionContext`. What the publishing service put in its context — a tenant, a
user, a locale, a feature flag — is in the envelope's headers, so authorisation on a message is the
same code as authorisation on a request.

### The trace travels in the metadata

`TraceContextDispatchInterceptor` writes the active trace into every message as it is dispatched —
`traceparent`, and `tracestate` and `baggage` when there are any — unless the message carries one
already: an event rebuilt from elsewhere keeps the trace it was published in. Being metadata, the
trace goes wherever the event goes: into the outbox row, onto the wire, into the event store beside
the event. `EventTrace.of(event)` reads it back as a context a span can start in, and
`EventTrace.carry(event, view)` passes it on to what the event becomes — which is how a subscription's
delivery of `PostCreated` ends up in the trace of the `createPost` that started it, in another
container, seconds later.

Where a message is delivered, `ingesting(message, work)` opens one `CONSUMER` span, a child of the
trace the message carries, around the **whole** unit of work — not only the handler: what the unit
publishes in reaction is written to the outbox in `PREPARE_COMMIT`, with the trace that is active
then. A span that ended before `PREPARE_COMMIT` would send every outgoing message without a
`traceparent`, and the next service would open a trace of its own.

There is no span for the relay's publish, and none is needed: the link between the two sides is the
`traceparent` captured at dispatch, so the consumer's span hangs off the work that raised the event and
not off whichever poll happened to publish it. It is `@opentelemetry/api` and nothing else, a no-op
until an application starts an SDK (`@nestposts/observability`).

---

## Interceptors

Two kinds, Axon 5's, and the application adds its own with `dispatchInterceptors` and
`handlerInterceptors` (classes, resolved by Nest):

| | sees | may |
|---|---|---|
| `MessageDispatchInterceptor` | every message as it is dispatched: an event as it is published, a command as it is sent | change the message — add metadata, most of the time — and hand it on with `chain.proceed(message, context)` |
| `MessageHandlerInterceptor` | every message as it is handled: a command in its unit, an event delivered to the subscribing handlers, an event a streaming group receives from the outbox | hand the chain a different message, or a branch of the context holding something the handlers should see |

```ts
@Injectable()
export class StampRegion implements MessageDispatchInterceptor {
  interceptOnDispatch(message: Message, context: ProcessingContext | undefined, chain: MessageDispatchInterceptorChain) {
    return chain.proceed(message.andMetadata({ region: 'eu' }), context);
  }
}

TransportEventBusModule.forRoot({ …, dispatchInterceptors: [StampRegion] })
```

**A dispatch interceptor is synchronous.** An `aggregate.commit()` is awaited by nobody, and what it
publishes must be what it staged, not what a promise decides later. The context it is given is the
dispatcher's, `undefined` outside any unit.

**The first registered runs outermost**, as Axon builds its chains, and the order is fixed:
`CorrelationDataInterceptor` first — it is both kinds at once, computing the correlation data where a
message is handled and stamping it where one is dispatched — then the trace, on dispatch, and then
the application's.

---

## Publishing, in detail

### Staged in the unit of work, written and told in `PREPARE_COMMIT`

`TransportEventBusService` is Axon 5's `EventSink` and its `SimpleEventBus`: a per-unit queue drained
in `PREPARE_COMMIT`. Everything that publishes — a handler, a saga, an aggregate's `commit()` — goes
through it, and what it publishes becomes an `EventMessage`: identified, typed, stamped with what the
request stands for and, by the dispatch interceptors, with the correlation data of the message being
handled and the trace it was published in.

The first publish of a unit registers **one** `PREPARE_COMMIT` action, and it takes the staged events a
batch at a time:

```
commandBus.execute(command)
  PRE_INVOCATION  the transaction begins                   MikroOrmTransactionManager
  INVOCATION      the handler runs; post.commit() STAGES its events — nothing is written or told
  PREPARE_COMMIT, inside the transaction
    ├ the event store appends the batch — on the unit's append condition, when it sourced anything
    ├ the outbox writes what the batch owes: a destination's message, a streaming group's
    └ the subscribing handlers are told; the delivery waits for them and for what they dispatch
    … and again for whatever those handlers published, until nothing is left
  COMMIT          the handler's writes, the append, the outbox rows and the handlers' writes, together
  AFTER_COMMIT    EventOutbox.committed() — the relay, by mode; the subscriptions hear the events
```

`execute` resolves after `AFTER_COMMIT`, so a caller that awaited the command has awaited its events —
committed, told, and in `drain` mode already published. A handler that throws rolls the transaction
back and the staged events are **discarded**: no append, no row, nothing told. An event is a fact, and
the unit of work is what makes it one only once the work is.

**The subscribing handlers run inside the transaction** — Axon 5's `SubscribingEventProcessor` — and
that is a change from what this library used to do, which was to tell them after the commit. A
projection writes in the same transaction as the command that caused it, and a subscribing handler
that fails **fails the command**, unless its group's error handler says otherwise.

**Events published during delivery are drained in the same phase.** A saga's command that publishes,
a handler that publishes: the loop takes them in the next round. A unit still publishing after ten
rounds fails, because a handler that publishes every time it is told would never let it commit.

**There is no direct emit.** The bus never talks to a broker; `EventOutbox` writes, the relay sends. A
service without `outbox` in its options publishes to its own process and nowhere else.

**`publishAll` copies the array it is given**, and that copy is load-bearing. `AggregateRoot.commit()`
hands it the aggregate's internal array and then calls `uncommit()`, which empties it; a unit holds the
events until its `PREPARE_COMMIT`, and without the copy finds the array cleared — the command succeeds,
appends nothing and tells nobody.

### Outside any unit of work

An `aggregate.commit()` nobody wrapped in a unit — a request that provisions a profile, a script — is
published in a unit of its **own**, on a **detached** transaction (`UnitOfWorkFactory.detached()`,
MikroORM's `REQUIRES_NEW`): nobody awaits it, and as a savepoint of whatever transaction the caller is
in it could outlive that transaction (measured: `RELEASE SAVEPOINT can only be used in transaction
blocks`). When there is nothing to write — no event store, nothing the outbox owes — it goes straight
to the handlers, synchronously, as Axon's `SimpleEventBus.publish(null, events)` does, so a local
handler is not delayed by a transaction it never needed.

### What one event becomes

`EventOutbox` hands each batch to `EventMessages`, which turns each event into up to two kinds of
`@nestjs/outbox` message, addressed by what the event declares and nothing else:

| | for its namespace's destination | for a streaming processing group |
|---|---|---|
| when | this service publishes, the event is its own (not ingested), a destination takes its namespace, and the route has a transport for it | a streaming group's handlers take the event — one message **per group** |
| `id` | the event's identifier | `<event>@<service>/<group>` — scoped by the service, because one outbox table serves every service |
| `topic` | the qualified name, `posts.PostCreated` | `@processing-group`, the one topic every group shares |
| `key` | `posts/<sequence>` | `@processing-group/<group>/<sequence>` |
| `payload` | the event's fields, encoded once for JSON (`encodeData`) — a `Date` comes back a `Date` | the same |
| `headers` | the message's metadata, key for key, and the framework's facts beside it | the same, plus `cqrs-transport-processing-group`, and the origin preserved for an ingested event |

The **sequence** is the `SequencingPolicy`'s answer — the entity, by default — so one entity's
messages are published one at a time, in the order their transactions committed. It is also the
routing key's last segment and, on SNS, part of the message group.

The **headers** are the metadata the event was dispatched with — the request, the correlation, the
trace — plus the framework's own facts: `cqrs-transport-message-type`, `cqrs-transport-timestamp`,
`cqrs-transport-origin`, `cqrs-transport-tags` and `cqrs-transport-event-id` (the event's identifier,
which a group's message cannot use as its id). They are captured at dispatch, and that is the point:
the relay publishes later, in no request and in no trace.

An event gets no destination message when this service does not publish (`publishes: false`), when it
came from another service (the origin mark — publishing it again would be the loop the mark exists to
cut), when no destination takes its namespace, or when the route has no transport for it.

### Which routing key an event goes out under

`EventAddress.routingKey`, read off the event and nothing else — and off the message, by
`EventAddress.ofMessage`, when a transport's packet publishes it: the outbox's topic is the qualified
name, and the routing key is what a broker adds to it. Three segments:

```
posts.PostCreated.9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60
└──┬─┘ └────┬────┘ └──────────────────┬──────────────┘
namespace   name                  the sequence
```

The first two are **selection**: a consumer binds to `posts.PostCreated.*` and receives only what it
asked for. The third is **ordering**: with the default policy it is the entity, so the whole key
identifies one post. A policy that sequences differently changes it too — `SequentialPolicy` puts
`none` there for every event, and one the application writes puts whatever it answers — and an event
no policy sequences gets `none`, so the key keeps its three segments, which is what the bindings
depend on.

It is the *qualified* name, never the local one: without the namespace in the value, a binding on
`posts.*` does not match — the message goes out, the exchange drops it, and nothing in the log says so.

A transport that addresses differently says so in its **packet** (`toPacket`): Inngest, whose
triggers have no wildcards, is emitted under the qualified name instead — see **Adding a transport**.

### What decides whether an event leaves

| the event | leaves through | runs locally |
|---|---|---|
| `@EventType({ namespace: 'posts' })`, with `destinations.posts` and a transport for it | that destination | yes, in `PREPARE_COMMIT` |
| `@EventType({ namespace: 'posts' })`, with `destinations.posts` and no transport for it | nowhere: the message is not written | yes, in `PREPARE_COMMIT` |
| `@EventType({ namespace: 'tags' })`, and no `destinations.tags` | nowhere | yes |
| no `@EventType` at all | nowhere: it has no namespace | yes |
| any of the above, published by a service with `publishes: false` | nowhere | yes |
| any of the above, ingested from another service | nowhere: the origin mark | yes |

Every event published on this bus also runs locally — the subscribing groups in `PREPARE_COMMIT`, the
streaming ones through the outbox. What leaves is decided by the namespace, the destinations and the
route, never by the event about this process.

### Who publishes what the outbox holds: the relay mode

`@nestjs/outbox`'s relay claims due rows under a lease, publishes each through its namespace's
`ClientProxyTransport` — or `local`, for a streaming group — deletes it once a transport took it,
reschedules it with backoff when one did not, and dead-letters it after the last attempt. Where that
loop runs is a decision about the **process**, and it is said twice at the application's root, from
one config value: `relay.enabled` to the `OutboxModule`, and `relay` to the bus, in
`outbox.useFactory` — which is what tells it what to do once a unit of work has committed:

| `relay` | the relay | after a unit of work commits | for |
|---|---|---|---|
| `poll` (default) | polls in this process, every `pollInterval` | wakes it (`notify()`), so a commit does not wait for the next poll | a long-lived process: `pnpm dev`, a container |
| `drain` | never polls | publishes what is due — `runOnce()`, again **while a round publishes something**, ten rounds at most — before the unit answers | a function, which is frozen the moment it answers and so can hold no loop |
| `off` | never polls | nothing: another process relays | an API-only instance beside a process that relays; no deployment here uses it |

A drain that fails is logged and **not** rethrown, and neither is anything else that fails after the
commit: the rows are committed, the work happened, and answering an error for it — a 500, a message
handed back to SQS — would only invite a retry that redoes the work instead of publishing it. A client
sending the command again makes a second post; a redelivered message is dropped by the inbox, whose row
committed with the work. Only a failure up to and including `PREPARE_COMMIT` rolls the unit back, and
that one the edge retries: the transport redelivers the message, the client sends the request again.

**What a drain could not publish goes out with the next unit of the same service.** A message the
broker refused was rescheduled with the outbox's backoff; a function frozen or killed between the
commit and the publish left its messages due. Either way they stay in the outbox, committed, and the
next unit of this service that commits messages of its own drains them with those: `runOnce()` claims
whatever of this service's messages is due, not only what the committing unit staged. A unit that
wrote nothing to the outbox drains nothing, and what ten rounds did not reach waits the same way.
**While the service receives nothing that publishes, nothing publishes it** — that is the deliberate
trade for having no scheduled component, and a deployment that cannot accept it runs a `poll` process
instead. A drain stops at the first round that claims nothing **or publishes nothing**, so it needs no
copy of the relay's `batchSize`, which the package keeps to itself.

**It stops when a round publishes nothing, and that was measured.** It used to loop until a round
claimed nothing. A message the broker refused is rescheduled with the outbox's backoff, becomes due
again, and the same drain claimed it again — every attempt the message had was spent inside one drain
while the broker was down, and it was dead-lettered before the broker came back. A round that
publishes nothing now leaves what it claimed to the next drain, or to a polling relay, with the real
backoff between attempts.

**Why an outbox at all, then, and not a publish.** Publishing inside the transaction — a dual write —
puts an event on the wire for a transaction that may still fail to commit: a phantom
`PostPreCreated`, which tagging decides on for a post that never existed. Publishing after the commit
with no durable record loses the event whenever the process dies between the two. The outbox row is
the only thing that is committed exactly when the work is, and a drain is just the earliest moment
after that at which somebody publishes it.

The bus's own settings (`TransportOutboxSettings`) are that mode and the root's `route`. Everything
else about the relay is `@nestjs/outbox`'s and is set on the root `OutboxModule`:

| `OutboxModule` option | default | |
|---|---|---|
| `relay.pollInterval` | `1s` | the wait between two polls of an idle relay |
| `relay.batchSize` | `100` | messages claimed per poll, and per round of a drain |
| `relay.lease` | `30s` | how long a claim is exclusive |
| `relay.publishTimeout` | a third of `lease` | a publish that takes longer is a failed attempt |
| `relay.concurrency` | `10` | keys published side by side within a batch |
| `retry` | 20 attempts, 30 to 60 minutes in all | attempts and backoff before a dead letter: size it to how long a broker can be down, and to how long a streaming group's handler can keep failing |

The applications read them from the environment in their own `config/outbox.config.ts`:
`POSTS_OUTBOX_RELAY`, `POSTS_OUTBOX_POLL_INTERVAL_MS`, `POSTS_OUTBOX_RETRY_ATTEMPTS`, and the
`TAGGING_` twins; the web reads `WEB_OUTBOX_RELAY` (default `drain`, because OpenNext's server is a
function) and `WEB_OUTBOX_RETRY_ATTEMPTS`.

**Every row belongs to the service that wrote it.** One `transport` schema serves every service, and a
relay may only publish what its own service produced — the destinations are the producer's, and
another service has none of them. `MikroOrmOutboxStore` (`MikroOrmOutboxModule.forRoot({ producer })`)
is built with the service's name as its `producer` and reads and writes only its own rows; the inbox
is not scoped that way, because its key already names the consumer.

### What a dead letter does, and who prunes the inbox

`@nestjs/outbox` publishes, retries and dead-letters; it prunes no inbox and alerts nobody. Neither
does this library — the outbox is the application's — nor `@nestposts/outbox-mikro-orm`, which is only
its store. The two things left over are done where they belong:

- **the inbox is pruned by the migrator.** `apps/migrator`'s `migrate()` ends with `pruneInbox()`,
  which deletes the `transport.outbox_inbox` rows processed longer ago than `INBOX_RETENTION_DAYS` —
  30 by default, longer than any redelivery, a dead letter's requeue included. The inbox is one table
  for every consumer, so one prune serves every service, and `migrate()` runs on every deploy, in every
  `setup` and on demand as `inbox:prune`: no service, long-lived or a function, carries a timer for it.
  A message redelivered after its row was forgotten is acted on again, which is why the third guard —
  the aggregate's own state, or the event store's append condition — has to survive an emptied inbox;
- **a dead letter is a report.** `DeadLetterReporting` (`@nestposts/observability`, installed by
  `ErrorReportingModule`) listens on `@nestjs/outbox`'s diagnostics channel,
  `nestjs:outbox:dead-lettered`, and reports each one to GlitchTip **in the trace the message was
  staged with** — so the issue opens onto the request whose event could not be published, or whose
  streaming group could not handle it. Retries are not reported: they are the relay doing its job.
  It is the only report the outbox gives here; there is no lag warning, and whoever wants to alert on
  the backlog reads `OutboxRelay.stats()`.

A dead letter keeps its `seq` and its id. `@nestjs/outbox`'s `OutboxDeadLetters` lists, requeues and
purges them over the same store: a requeued message goes back ahead of the later messages of its key,
and consumers' inboxes still recognise it if it had in fact arrived.

---

## Processing groups

An event handler and a saga belong to a **processing group** — Axon's: the handlers that are processed
together, by one processor, with one error handler. A class that declares none is a group of its own,
named after the class.

### Subscribing and streaming

Axon 5 has two event processors, and so does this library:

| | when the handlers run | in which unit of work | a failure | Axon 5 |
|---|---|---|---|---|
| **subscribing** (the default) | in the `PREPARE_COMMIT` of the unit that published | that one, inside its transaction | goes to the group's error handler — by default it fails the unit, so the command fails or the ingestion is redelivered | `SubscribingEventProcessor` — `LocalEventDelivery` |
| **streaming** | after that unit committed, when the outbox's relay delivers the group's message | one of their own per message | goes to the group's error handler — by default it fails the delivery's unit, which the outbox retries with backoff and in the end dead-letters | `PooledStreamingEventProcessor` — `StreamingGroupDelivery` |

Choose **subscribing** for what must be consistent with the work that caused it: a projection, a saga
whose command belongs to the same decision. Choose **streaming** for what may lag and must not hold
the work back or be lost with it: a notification, an email, a call to somebody else's API. A streaming
group's failure does not fail the command that published; it is retried on its own schedule, and one
group failing does not hold back another.

### Declaring a group

```ts
@Injectable()
@ProcessingGroup('notifications', { events: [PostCreatedEvent] })
export class NotifyAuthorOnPostCreated {
  @Saga()
  notifyTheAuthor = (events$: Observable<IEvent>): Observable<ICommand> =>
    events$.pipe(ofType(PostCreatedEvent), map((event) => /* … */));
}
```

**What a group is processed by is the application's decision, at its root:**

```ts
TransportEventBusModule.forRootAsync({
  …,
  processingGroups: {
    notifications: 'streaming',
    audit: { processor: 'subscribing', errorHandler: new LoggingErrorHandler() },
  },
})
```

The decorator may carry a default — `@ProcessingGroup('tagging-stand-in', { processor: 'streaming' })`
— for a group whose author knows how it must run, such as test support that has to run after the
commit. **The root always wins.** A group the decorator declares streaming in a module with no
outbox — a suite that boots the bus alone — is processed as subscribing, with a warning; a group the
**root** declares streaming without an outbox fails the module, because that is a wiring mistake in
the application and not a default meeting a suite.

### Sagas declare their events

An `@EventsHandler(PostCreatedEvent)` already says which events it takes. A `@Saga` cannot: its
`ofType` is inside a stream, where nothing can read it. A streaming group is staged one outbox message
for each event its handlers take, so a saga in a streaming group declares its events on the group —
`@ProcessingGroup('notifications', { events: [PostCreatedEvent] })`. One that declares none takes
**every** event, which in a streaming group means a message in the outbox for every event the service
publishes or ingests; the module logs a warning naming the group at boot.

An event a streaming group takes must carry `@EventType`: the delivery rebuilds it from the outbox
message by its message type, and an undeclared class can only come back as an anonymous one that no
handler matches.

### How the handlers are made part of a delivery

`EventHandlingComponents` wraps, in `onModuleInit` — before `CqrsModule` binds anything in its
`onApplicationBootstrap` — every `@EventsHandler`'s `handle` **on its prototype**, so a
request-scoped handler, which `@nestjs/cqrs` resolves afresh for every event, is covered as well; and
every `@Saga` of every provider, on the instance. A wrapped handler invoked in a delivery that does not
admit its group does nothing; one that is admitted tracks its promise on the delivery. A wrapped saga
sees only the events of deliveries that admit its group, and marks the commands it emits with its
group, so a command's failure is the group's failure.

**Something publishing straight onto `EventBus`** — not through this bus — reaches every handler, as it
always did: there is no delivery, so nothing is filtered.

The handlers are **found**, not intercepted. Wrapping `EventBus.bind` would be the obvious way to
reach them and it is too late: `CqrsModule`'s explorer calls it during its own bootstrap. They are
discovered through the `ModulesContainer` instead, and Nest's `bind` reads `handler.instance.handle`
when an event is published, not when it binds.

### Error handlers

What a group does when one of its handlers fails — Axon 5's `ErrorHandler`. Throwing fails the unit
the delivery runs in; returning means the failure was dealt with.

| | |
|---|---|
| `PropagatingErrorHandler` (the default) | the failure is the unit's: a subscribing group rolls back the unit that published — the command fails, the ingestion is redelivered — and a streaming group's delivery is retried by the outbox, then dead-lettered |
| `LoggingErrorHandler` | logged, and the unit goes on — for a group whose work is not worth a rollback |
| your own | `handleError({ processingGroup, error, message, context })` |

The delivery collects every failure of its handlers and of the commands its sagas dispatched, and hands
each to its group's error handler once all of them settled.

### Sequencing

A `SequencingPolicy` — Axon 5's — says which events must be handled one after the other: events with
the same sequence identifier are published, delivered and handled in order, and events with different
ones may overtake each other. Here the sequence is `@nestjs/outbox`'s message `key`, because that is
the only ordering the outbox promises: every message of one key is published one at a time, in commit
order.

| policy | the sequence |
|---|---|
| `DefaultSequencingPolicy` (the default) | per entity, and every untagged event in one sequence — `HierarchicalSequencingPolicy(SequentialPerEntityPolicy, SequentialPolicy)` |
| `SequentialPerEntityPolicy` | the event's first tag — Axon's `SequentialPerAggregatePolicy`, read off the tag instead of an aggregate identifier, which Axon 5 no longer puts on the message. An event with several tags is sequenced by the first, with a warning |
| `SequentialPolicy` | everything in one sequence, `none` |
| `HierarchicalSequencingPolicy(primary, fallback)` | the first that has an answer |

One policy serves the whole service (`sequencingPolicy`), and its answer is also the routing key's last
segment and SNS's message group — so changing it changes what a broker orders by. Any other is a
subclass of `SequencingPolicy` with one method, `sequenceIdentifierFor(message)`: sequencing by a
metadata value, or not at all, is a few lines of the application's.

### What a subscription hears

A subscribing handler is told an event inside the transaction, and a unit can still roll back after
that. A projection that ran then is rolled back with it; a GraphQL subscription that pushed the event
to a browser cannot take it back. So what *pipes* the bus — a `@SubscriptionHandler` — reads
`CommittedEvents` instead, which emits each event a unit delivered **once the transaction that owns it
committed**, and everything published straight onto `EventBus` as it is published. A streaming
delivery is withheld from the subscriptions altogether: they heard the event when the unit that raised
it committed.

`CommittedEvents` decorates the one `EventBus` there is by repointing its observable side in
`onApplicationBootstrap`, after `CqrsModule` bound every handler and every saga to `subject$` — they
keep what they hold, and only what pipes the bus afterwards reads it. It is the same move
`EventSourcedEventBus` makes to read the event store instead, which a service serving subscriptions
from several processes installs in its place (**Subscriptions across processes**).

### A streaming group on the outbox

`StreamingGroupDelivery` is one `@OnOutboxMessage('@processing-group', { consumer:
'processing-groups', inbox: false })` for every streaming group of the service — the group is in the
headers, so a group declared anywhere needs no binding of its own, and an event type added later needs
none either:

| Axon 5 | here |
|---|---|
| the processor reads the event store from its token | the relay claims the group's messages from the outbox |
| segments, claimed and extended in the `TokenStore` | leases, fenced by the relay's owner |
| the `SequencingPolicy`: one sequence handled in order | the message `key`: one key published in order |
| the token stored in the batch's unit of work | the inbox record written in the delivery's unit of work |
| a failed batch: rollback, release with backoff, retry | a failed delivery: rollback, reschedule with backoff, retry |
| a dead-letter queue, left to an extension | `@nestjs/outbox`'s dead letters, with `requeue` |

Each message is **one unit of work**: the inbox record — through the package's own
`OutboxInbox.processInTransaction`, under the service and the group (`EventMessages.groupConsumer`,
`posts-api/notifications`) and the message's own id, `<event>@posts-api/notifications` — and the
delivery to that group's handlers commit together, or roll back together and are retried. The
decorator's `processing-groups` records nothing (`inbox: false`): the inbox and the outbox are one
table each for every service, so a group named only by itself would collide with another service's
group of the same name — the second service's message refused by the unique id, or its delivery
skipped as already handled. The event is the one the publishing unit raised or ingested: restored under
its identifier, marked as ingested only if another service produced it, with the request its metadata
carries.

The unit is **given the message before it begins**, so a multi-tenant transaction manager opens the
transaction in the tenant the message names: the relay delivers outside any request, and nothing else
would have opened it.

**A streaming group is fed from the moment it exists.** Its messages are written when an event is
published, so a group added later does not receive the past, and a group cannot be replayed: its
messages are the outbox's, deleted once handled. That is the one thing an outbox-fed processor cannot
do that a token-fed one can, and the price of having no second store to read.

---

## Receiving, in detail

### The three guards

Each covers what the others do not:

| guard | where | catches |
|---|---|---|
| the origin mark | on the message, `cqrs-transport-origin` | the event this service produced and got back — which is what keeps "everything published locally leaves" and "everything received is published locally" from feeding each other forever |
| the inbox | `@nestjs/outbox`'s `OutboxInbox`: one `(consumer, message id)` row, in the same transaction as everything the message causes | a redelivery — no broker delivers exactly once — and, from the outbox, a message the relay published twice because a lease ran out under it |
| your aggregate, or the event store | the command handler reading its own state; the append condition of a decision the event store sourced | the same decision arriving as a *different* message. It is the only guard that survives an emptied inbox |

The inbox row is `on conflict do nothing` on `(consumer, message_id)`, not a query followed by an
insert: two deliveries racing each other both pass a query, and the conditional insert settles it in
the database — the second waits for the first transaction and then sees its row.

**It is keyed by the consumer**: two services ingesting the same event each keep their own memory of
it. The row also records what the message was and who sent it (`message_type`, `origin`, beside the
package's columns) when the application points `inbox.descriptions` at the store
(`InboxDescriptions`), which is what lets an operator or a suite read
`MikroOrmOutboxStore.processedBy('tagging')` and tell a service's own echo from what it ingested.

### What the ingestion's unit covers — everything

One message is one unit of work, and the unit runs in a transaction:

```
EventIngestion.ingest(envelope)
  the origin mark: this service's own echo is dropped here, before the inbox
  ingesting(message)                          the CONSUMER span, around the whole unit
  └ units.create({ identifier, message })     the message is in the context before PRE_INVOCATION
     PRE_INVOCATION   the transaction begins — in the tenant the message names, for a tenant-aware manager
     INVOCATION       OutboxInbox.processInTransaction(tx, consumer, id)   the inbox row, or a duplicate and nothing else
                        describeInbox                                     what it was, who sent it
                        bus.stage(context, [message])                     the event, staged like any other
     PREPARE_COMMIT   the event store appends it — unless it already has its identifier
                      the outbox: a message for every streaming group that takes it
                      the subscribing handlers: projections, sagas, and the commands those sagas
                        dispatch — each a unit of its own, joined to this transaction, waited for
                      … and whatever they published, the same way
     COMMIT           all of it, or none of it
     AFTER_COMMIT     the relay; the subscriptions
```

It commits whole or rolls back whole. A reaction that fails — a projection that throws, a saga's
command that throws — is its group's failure, and with the default propagating error handler it fails
the unit: the inbox row, the append, the writes, the outbox rows the other reactions staged, all rolled
back. The redelivery is new again, and the transport's retry (and `@RetryPolicy`) has something to act
on. A crash half-way leaves nothing half-remembered. The caller's `await` — `processSqsEvent` in a
function — means all of it, which is what keeps Lambda from freezing a saga halfway.

**The event reaches the subscribing handlers while the transaction is open**, because that is what
makes their reactions part of it. A subscription hears it after the commit (`CommittedEvents`).

**Every reaction to one ingested event shares one transaction, and one identity map.** A projection and
the command a saga dispatches run on the same `EntityManager` fork — the command's savepoint joins the
ingestion's transaction — so a reaction reads what the event carries; it does not reload the aggregate
a projection of the same event is writing (measured, in the days before this rule: a post reached
version 2 with no tag, once in three runs).

**A reaction whose effect is outside the database commits it on its own.** Rolling the transaction back
does not unsend an email, so a delivery recorded in the rolled-back transaction would be sent again by
the retry. `NotificationDeliveryRepository.recordAfter(delivery, send)` (`libs/notifications`) is the
shape: send, then record the delivery, in a transaction of their own. Or make the reaction a
**streaming** group, whose delivery is a unit of its own after the commit.

**The transport's tables live in a schema of their own, `transport`** (`TRANSPORT_SCHEMA`,
`@nestposts/database`), created by the system migrations: `outbox_messages`, `outbox_dead_letters` and
`outbox_inbox` (`MikroOrmOutboxModule`'s) and `event_log` (`MikroOrmEventStoreModule`'s). They are the
transport's bookkeeping, not a tenant's data — one inbox and one outbox for every service, one store
for every event, each row of it recording the tenant it was appended in. Their native statements ask
the metadata where the table is, so a service keeps working whatever tenant its request is in.

### Telling an ingested event from a local one

```ts
import { isIngested, originOf } from '@nestposts/transport-eventbus';

if (isIngested(event)) {
  // it came from originOf(event) — do not decide again, project it
}
```

That is how a projection knows to materialise a decision, and how a saga knows not to take one twice.
An event read back from the event store is marked as ingested too, with no origin.

---

## The event store, with dynamic consistency boundaries

`eventsourcing/` is Axon 5's event store: **there are no streams**. An event is about whatever its tags
say, a decision reads the events whose tags it cares for, and the decision is appended on condition
that none of what it read has changed. Where the boundary of a decision lies is drawn by the decision,
at the moment it reads — which is what Axon calls a *dynamic consistency boundary* — and not fixed in
advance by an aggregate.

### Tags, criteria, markers and conditions

| | |
|---|---|
| `Tag` | `key=value` — `postId=9f1d…`. An event carries as many as it is about; the `TagResolver` decides which — `AnnotationBasedTagResolver`, the default, reads `@EventType({ tags })`, and any other is a subclass with one method, `resolve(message)` |
| `EventCriteria` | which events a decision depends on. An event matches a criterion when it carries **all** of its tags and, when the criterion names types, is one of them; it matches the criteria when it matches **any** criterion |
| `ConsistencyMarker` | how far a decision read: the position of the last event it saw among those its criteria match. `ORIGIN` is before the first event |
| `AppendCondition` | what must still be true for an append to be accepted: no event matching the criteria was appended after the marker |
| `AppendEventsTransactionRejectedError` | the append was refused: something the decision depended on changed. It is not transient — the same decision against the same history is refused again |

```ts
EventCriteria.havingTags(new Tag('postId', id))                           // one entity's events
EventCriteria.havingTags(course).andBeingOneOfTypes('courses.StudentEnrolled') // the enrolments of a course
  .or(EventCriteria.havingTags(student))                                  // …or anything about the student
EventCriteria.ofTypes('courses.CourseOpened')                             // every event of a type
EventCriteria.anyEvent()                                                  // everything
```

Types are qualified names, without the version.

### The store and the unit of work

`EventStore` keeps its side of each unit as a resource of the unit's context — Axon 5's
`EventStoreTransaction`:

- **every `source(criteria, context)` widens the unit's criteria and keeps the earliest marker** it
  read up to;
- the bus appends what the unit published in `PREPARE_COMMIT`, **carrying that as its condition** — so
  the append is refused if an event any of those reads would have matched was appended in the
  meantime;
- a unit that read nothing appends unconditionally;
- a unit's own appends move its marker forward, so a unit that appends twice — a handler publishing
  while the first batch is delivered — is not refused by itself.

Every event a unit publishes **or ingests** is appended, filed under the tags its resolver gives it,
with its metadata — the request, the correlation, the trace, the tenant. An identifier the store
already has is not appended again, so a redelivery costs nothing.

### The engine

`EventStorageEngine` is the port — Axon 5's — and it speaks plain rows (`StoredEvent`,
`StoredCriterion`, `StoredAppendCondition`), so an implementation needs nothing of this library to
satisfy it. What an implementation owes, and `@nestposts/event-store-mikro-orm`'s tests hold it to:

- `appendEvents(events, condition, transaction)` writes through the unit's transaction; with a
  condition, it is refused when an event matching the condition's criteria was appended after its
  marker — and **two appends whose criteria or tags overlap must not both pass a check each made
  before the other committed**: the store serialises them on the tags involved;
- `source(criteria, transaction)` answers every event matching the criteria, in order;
- `readAfter(position, limit, gaps)` answers the global order after a position, asking again for the
  positions in `gaps`; `head()` is the last position written.

`MikroOrmEventStorageEngine` (`@nestposts/event-store-mikro-orm`) is the implementation here, on one
table, `transport.event_log`, with a `tags text[]` column and a GIN index; its README says how a
condition holds under concurrency.

```ts
imports: [MikroOrmEventStoreModule],                       // the table and the engine, global
TransportEventBusModule.forRoot({
  …,
  eventStore: {
    engine: MikroOrmEventStorageEngine,
    entities: [{ entity: Post, tagKey: 'postId' }],
  },
})
```

### A decision across entities: a course and its students

The case streams cannot express, and the reason Axon 5 has tags. A student may enrol in a course while
it has seats, and in no more than three courses: the decision depends on the course's history **and**
the student's, and neither is an aggregate that owns the other.

```ts
@EventType({ namespace: 'courses', tags: ['courseId'] })
export class CourseOpenedEvent {
  constructor(readonly courseId: string, readonly seats: number) {}
}

@EventType({ namespace: 'courses', tags: ['courseId', 'studentId'] })
export class StudentEnrolledEvent {
  constructor(readonly courseId: string, readonly studentId: string) {}
}

@CommandHandler(EnrolStudent)
export class Handler implements ICommandHandler<EnrolStudent> {
  constructor(
    private readonly store: EventStore,
    private readonly bus: TransportEventBusService,
  ) {}

  async execute({ courseId, studentId }: EnrolStudent): Promise<void> {
    const course = new Tag('courseId', courseId);
    const student = new Tag('studentId', studentId);
    const history = await this.store.source(
      EventCriteria.havingTags(course).or(
        EventCriteria.havingTags(student).andBeingOneOfTypes('courses.StudentEnrolled'),
      ),
      ProcessingContext.current(),                       // recorded on the command's unit
    );

    const seats = history
      .map(({ payload }) => payload)
      .find((event): event is CourseOpenedEvent => event instanceof CourseOpenedEvent)?.seats ?? 0;
    const enrolments = history.map(({ payload }) => payload)
      .filter((event): event is StudentEnrolledEvent => event instanceof StudentEnrolledEvent);
    if (enrolments.filter((event) => event.courseId === courseId).length >= seats) {
      throw new CourseFullException(courseId);
    }
    if (enrolments.filter((event) => event.studentId === studentId).length >= 3) {
      throw new TooManyCoursesException(studentId);
    }

    await this.bus.publish(new StudentEnrolledEvent(courseId, studentId));
  }
}
```

The publish is staged, and appended in `PREPARE_COMMIT` on the condition the read recorded: *no event
about this course, and no enrolment of this student, after the position the read saw*. Two students
taking the last seat at once both read, both decide, and the second append is refused with
`AppendEventsTransactionRejectedError` — the store locks the tags involved, so the second waits for the
first to commit and then sees it. So is a student enrolling in two courses at once past the limit. An
enrolment in another course by another student touches neither criterion and is never in the way.

Pass the context. `store.source(criteria)` without one is a read and nothing else: it records no
condition, and a decision made on it is appended unconditionally.

### Event sourcing an entity: the Post

`apps/tagging` decides about a Post it has **no table for**. It declares the entity, and there is
nothing else to write:

```ts
eventStore: {
  engine: MikroOrmEventStorageEngine,
  entities: [{ entity: Post, tagKey: 'postId' }],
},
```

`entities` is Axon 5's `@EventSourcedEntity(tagKey)`, declared at the root because the entity's library
knows nothing of this one, and it is `{ entity, tagKey, token? }` and nothing more. `entity` is the
class, because a replay starts from an empty one — `new Post()` — and `@nestjs/cqrs`'s `AggregateRoot`
does the rest through `loadFromHistory`; `tagKey` is the tag the entity's events carry its id under,
`@EventType({ tags: ['postId'] })`. Each entry gets an `EventSourcingRepository` — injected as
`EventSourcingRepository` itself, or under the `token` the entry names when a service sources more than
one entity:

```ts
@CommandHandler(CompletePostWithDefaultTag, { scope: Scope.REQUEST })
export class Handler implements ICommandHandler<CompletePostWithDefaultTag> {
  constructor(
    private readonly posts: EventSourcingRepository<Post>,
    private readonly publisher: EventPublisher,
    @Inject(REQUEST) private readonly request: AsyncContext,
  ) {}

  async execute(command: CompletePostWithDefaultTag): Promise<void> {
    const post = await this.posts.load(command.postId);       // sourced in this unit of work
    if (!post) throw new PostNotFoundException(command.postId);
    if (post.isComplete()) return;                             // the aggregate is a guard too

    this.publisher.mergeObjectContext(post, this.request).complete([Tag.default()], new Date());
    post.commit();                                             // appended at PREPARE_COMMIT — if nothing changed meanwhile
  }
}
```

**Loading is a read with a criteria** — every event tagged with the entity's id — and the store records
it on the unit: the events the unit publishes are appended on condition that no event tagged with that
id was appended since. Two units deciding about the same post at once cannot both succeed; the second
is refused. That is the dynamic consistency boundary with the boundary drawn by the entity's tag.

Within one unit an entity is loaded once: a second `load` of the same id answers the same instance,
with whatever it has applied since. The replay is the domain's own — `new Post()`, then
`loadFromHistory` through the `on<Event>` handlers it already has, the same ones the service that owns
the table replays with.

**There is no `save`**: committing the entity already is one. `commit()` publishes, and the bus appends
what is published — one write path, which is Axon's `EventSourcingRepository` too.

The saga that dispatches the command runs in the ingestion's `PREPARE_COMMIT`, and the command is a
unit of its own that joins the ingestion's transaction: the ingested event, the decision's append and
its outbox row commit in the transaction that recorded the message that caused them.

### Nothing guards a creation that arrives

What an ingestion appends is appended as it is: a redelivered message is dropped by the inbox, and by
the store's unique identifier if it ever got past it, and a second creation of the same entity under
another identifier cannot be produced in the first place — the producer's own aggregate refuses it.
The event log's old guard, which refused to append a creation to a stream whose first row was already
one, is gone and has no successor. If uniqueness of creation is ever needed, it belongs on the
creating command's append condition — `ConsistencyMarker.ORIGIN` on the entity's tag — and not on
ingested events.

---

## Testing without a broker

**One service on its own needs no transport at all.** With no broker a destination message is not
written, and what a service publishes reaches its own handlers in `PREPARE_COMMIT` like everything
else — so a spec asserts on the bus, and on what would have left with `EventMessages.forDestination`,
the same function production writes the outbox with. That is what `apps/tagging/test/tagging.spec.ts`
does for the decision it publishes:

```ts
tagging.app.get(EventBus).subscribe((event) => committed.push(event));
const messages = tagging.app.get(EventMessages);

const outbound = messages.forDestination(EventMessage.of(committed[0]), new Set(['posts']));
expect(outbound).toMatchObject({ topic: 'posts.PostCreated', key: `posts/${postId.value}` });
```

**What another service sends is delivered straight to the server.** `startInProcessService` starts a
service on a `TopicMemoryServer` (`@nestposts/microservices-memory`): `@camcima`'s `MemoryServer`,
which invokes the handlers Nest already wrapped with guards, interceptors, pipes and filters, extended
with what a topic exchange adds — a routing key is matched against every binding
(`posts.PostCreated.<id>` against `posts.PostCreated.*` and `posts.#`), and each delivery is a JSON
copy, as if it had crossed a wire. `server.bindings()` is the in-process `list_bindings`:

```ts
const tagging = await startInProcessService(await Test.createTestingModule({ imports: [AppModule] }).compile());

await tagging.server.emit(`posts.PostPreCreated.${postId}`, envelope);   // the controller bound to posts.#
tagging.server.bindings();                                              // ['posts.#']
```

`startInProcessService(module, { onStart, onClose })` takes what runs once the service listens and
before it closes, because this library knows no database. A spec whose tables come from its entities
hands it `testSchemaLifecycle` (`@nestposts/database/testing`), which creates the spec's schema on start
and drops it on close; a spec whose tables the real migrations made hands it nothing:

```ts
const service = await startInProcessService(module, testSchemaLifecycle);
```

It starts a service the way production starts it, with `listen()`. `createTestingMicroservice` starts
it with `init()`, and in Nest 12 `NestMicroservice.init()` runs the bootstrap hooks **twice** — which
binds every `@EventsHandler` twice, and delivers every event twice to a suite that is there to prove
one delivery is one thing.

`publishedEnvelope(event, { producer, codec, request, metadata })` is that envelope **as another
service's outbox would have published it**, built by the same `EventMessages` production writes with,
so the headers, the routing key and the payload encoding are the real ones:

```ts
const { pattern, envelope } = publishedEnvelope(new PostPreCreatedEvent(id, 'Nest', new Date()), {
  producer: 'posts-api',
  codec: new PostRequestContextCodec(),
  request: new PostRequest(id, 'acme'),
  metadata: { correlationId: 'the-mutation' },
});
await consuming.server.emit(pattern, envelope);
```

**Two services in one suite** are two of those, and the broker between them is a client in this
process: a `RecordingClient` whose emits are delivered to the other side's server, wrapped as each
publishing namespace's `ClientProxyTransport` with `OutboxPackets.inProcess`. The outbox's relay, its
packets and its route are then the production ones, end to end:

```ts
class Wire extends RecordingClient {
  readonly to: TopicMemoryServer[] = [];

  protected override async dispatchEvent<T>(packet: ReadPacket): Promise<T> {
    for (const server of this.to) await server.emit(String(packet.pattern), packet.data);
    return undefined as T;
  }
}

const transports = { posts: ClientProxyTransport(ToConsuming, { toPacket: OutboxPackets.inProcess }) };

OutboxModule.forRoot({ imports: [WireModule], transports, route: OutboxRoute.over(transports), relay: { enabled: false } }),
MikroOrmOutboxModule.forRoot({ producer: 'publishing-service' }),
TransportEventBusModule.forRoot({
  identity: TransportIdentity.named('publishing-service'),
  transactionManager: MikroOrmTransactionManager,
  outbox: { destinations: ['posts'], useFactory: () => ({ relay: 'drain', route: OutboxRoute.over(transports) }) },
}),
```

An outbox is a table, so each service also gets a database — a schema of its own, from
`testDatabaseConfig` in `@nestposts/database/testing`, with `outboxEntities` among its entities.

`RecordingClient` on its own keeps what it was asked to send instead of sending it: the pattern it went
out under and what `toPacket` handed the client — the `OutboxEnvelope`, or the transport record around
it. A spec replaces a destination's client with one to see exactly what the relay published:

```ts
const tagging = await startInProcessService(
  await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PostEventsClient)
    .useValue(new RecordingClient())
    .compile(),
);

tagging.app.get<RecordingClient>(PostEventsClient).sent;   // [{ pattern, data }]
```

The doubles — `startInProcessService`, `RecordingClient`, `publishedEnvelope` — are behind
`@nestposts/transport-eventbus/testing` and not in the main barrel, because a production bundle must
not carry `@nestjs/testing`. There is no client for the memory transport: nothing publishes to a server
in its own process except a suite.

The worked examples, by what they prove:

| spec | proves |
|---|---|
| `unit-of-work/unit-of-work.spec.ts` | Axon 5's lifecycle: phase order, a phase of one's own, registration rules, a failure finishing its phase and skipping the rest, suppressed failures, error and completion actions that cannot change the outcome, sequential phases, interceptors, the current context, units that do not nest, resources and branches |
| `unit-of-work/transaction-manager.spec.ts` | the transaction begun before the handler and committed in `COMMIT`, rolled back on any failure, told the message, sequential for one connection, a manager by shape |
| `unit-of-work/unit-of-work-commands.spec.ts` | a saga's command in a unit of its own, the command waiting for the projection and the saga's command, a propagating group failing the command, a logging one not, correlation carried from command to event to command |
| `messaging/messages.spec.ts`, `messaging/correlation.spec.ts` | the message model, the correlation providers, correlation winning over the dispatcher, the chains' order |
| `transport-event-bus.service.spec.ts` | upstream's integration suite, over the outbox, and the staging rules: what a handler publishes while told, nothing told for a failed command, a publish after `PREPARE_COMMIT` refused, no unit when nothing has to be written |
| `outbox/event-outbox.spec.ts` | the event committed with its writes and sent only by the relay; discarded with a failed command; the subscribing handlers told inside the transaction; kept while the broker is down; a publish outside any unit, and one nobody awaited inside somebody else's transaction; `drain` and `poll`; no message written for a namespace with no transport |
| `outbox/streaming-group-delivery.spec.ts` | a streaming group not told at the commit, told by the relay after it, with the event the unit raised; one group retried without holding back another; told once however often the relay delivers |
| `eventsourcing/event-store.spec.ts` | tags and criteria, a decision accepted or refused by its condition, a unit not refused by its own append, an entity loaded once per unit — on the course and its students |
| `inbound/event-ingestion.spec.ts` | the three guards, the inbox rolling back with a failed reaction, two racing deliveries, the restored request, the legacy correlation key, the append inside the transaction |
| `inbound/request-propagation.spec.ts` | the request crossing everything: a guard, a saga, a request-scoped command handler, a refused tenant never ingested, a local chain with nothing on the wire |
| `in-memory/transport-loop.spec.ts` | two services over the in-process wire: the real class arriving, the request restored, one correlation id per command, each inbox under its own service, a redelivery reaching nobody, the loop cut by origin — and the tenant crossing and coming back while the authorship does not |
| `subscriptions/event-sourced-event-bus.spec.ts` | the event store as the bus's observable side: another container's events, a subscriber starting at the head, the three readers, a late commit not skipped, the tenant and the trace in the metadata |
| `transport-event-bus.module.spec.ts` | the wiring, and the two refusals: a root streaming group without an outbox, subscriptions without an event store |

`MikroOrmOutboxStore` passes `@nestjs/outbox/testing`'s own contract suites (`outboxStoreContract`,
`outboxInboxStoreContract`) with their concurrency cases on, in `libs/core/outbox-mikro-orm`, and
`MikroOrmEventStorageEngine` has its concurrent appends serialised in
`libs/core/event-store-mikro-orm`.

---

## What a message looks like

On RabbitMQ (`OutboxPackets.rabbitmq`, an `RmqRecord`):

```
routing key  posts.PostCreated.9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60

properties   message_id     0f0d2a5e-…                          ← the envelope's id: what every inbox keys by
             delivery_mode  2                                   ← persistent

headers      cqrs-transport-message-type   posts.PostCreated#2.0.0     ← resolves the class
             cqrs-transport-timestamp      2026-09-08T12:00:00.000Z
             cqrs-transport-origin         tagging                     ← cuts the loop
             cqrs-transport-tags           postId=9f1d1f36-…
             cqrs-transport-event-id       0f0d2a5e-…                  ← the event's identifier
             correlationId                 7b2c…                       ← the request, across services
             causationId                   51e0…                       ← the message that caused this one
             x-tenant                      acme
             post-request-post-id          9f1d1f36-…
             traceparent                   00-4bf9…-01

body         {"pattern":"posts.PostCreated.9f1d…",
              "data":{"id":"0f0d2a5e-…","topic":"posts.PostCreated","key":"posts/9f1d…",
                      "headers":{ …the same map… },
                      "createdAt":1788868800000,
                      "payload":{"postId":"9f1d…","title":"Nest","version":2,
                                 "occurredAt":{"@date":"2026-09-08T12:00:00.000Z"}}}}
```

The body is Nest's own envelope for a microservice message (`{ pattern, data }`), and `data` is the
`OutboxEnvelope` the relay built: the event's fields under `payload`, and what is said about it under
`headers` — the `cqrs-transport-*` keys are the framework's facts, and everything else is the message's
metadata, key for key. The headers go out **twice** on RabbitMQ — inside the envelope, which is what the
consumer reads on every transport alike, and as AMQP headers, where a broker, a management UI, a shovel
or a dead-letter queue expects to find routing facts without anybody decoding a body.

The one thing the payload still encodes is a `Date`: `{"@date":"…"}` goes out and a `Date` comes back,
because JSON has no date type and JavaScript has no field types at runtime to guess one.

To a client in this process (`OutboxPackets.inProcess`, a suite's `RecordingClient`) the data is the
envelope itself. On SNS the routing facts are lifted into message attributes, and on Inngest the
envelope is the event's `data`: see the next two sections.

---

## On AWS: SNS is the exchange, SQS is the queue

The transport itself — `SnsClientProxy`, `SqsClientProxy`, `SqsStrategy`, `SqsContext`,
`processSqsEvent`, the record builders — is **`@nestposts/microservices-aws`**, a package that knows
nothing about envelopes, CQRS or this library, the way `@nestjs/microservices` does not. What stays
here is what needs `@EventType`: the packet (`OutboxPackets.aws`) and the binding (`SnsFilterPolicy`).
Inngest is split the same way, into **`@nestposts/microservices-inngest`**, with
`OutboxPackets.inngest` and `inngestTriggers` (the `@EventType` registry as the strategy's `triggers`)
staying here.

Nothing in a controller, a handler or an event changes. What changes is the bootstrap, and the
mapping is close enough to read straight across:

| RabbitMQ | AWS | |
|---|---|---|
| topic exchange | **SNS topic** | one destination, every interested consumer |
| queue bound to `posts.#` | **SQS queue** subscribed with a filter policy | `SnsFilterPolicy.everyEventOf(POSTS_NAMESPACE)` |
| routing key | the `routingKey` message attribute, and `pattern` in the body | the same three segments |
| AMQP headers | the envelope's `headers`, in the body | SNS allows **ten** attributes; a message with a tenant and a trace needs more |
| `ClientRMQ` | `SnsClientProxy` / `SqsClientProxy` | a topic for a fact, a queue for a message addressed to one service |
| `ServerRMQ` | `SqsStrategy` | polling, or driven by a Lambda |

### Publishing

```ts
{
  provide: PostEventsClient,
  inject: [awsConfig.KEY],                            // the application's registerAs('aws')
  useFactory: ({ topicArn, client }: AwsConfig) =>
    new SnsClientProxy({ topicArn, clientConfig: client }),
}
```

and the destination wraps it with `OutboxPackets.for('aws')`. The client takes no serializer: its
default is Nest's `IdentitySerializer`, so what goes on the wire is exactly the packet the outbox built
— an `SnsRecord` whose body is `{ pattern, data: envelope }`, whose message attributes are the routing
facts, and whose FIFO fields are set. A default wire format is a decision, and here the decision is
the destination's (`toPacket`), not the client's.

On a **FIFO** topic `MessageGroupId` is the outbox message's `key` — `posts/9f1d…`, the namespace and
the sequence its policy put the event in — so one post's events are ordered against each other while
different posts proceed in parallel, and the order SNS keeps is the order the outbox published. It
falls back to the routing key's last segment for a message with no key. `MessageDeduplicationId` is
the envelope's id — so a relay that publishes the same message twice, a retry after a timeout or a
lease that ran out, is deduplicated by AWS before the far side's inbox has to. That is why
content-based deduplication stays off.

`SqsClientProxy` writes the same body, so a queue fed both ways — subscribed to the topic and written
to directly — needs one consumer. Use it for what is not a fact: a command sent to one worker, a
delayed sentinel (`new SqsRecordBuilder(payload).setDelaySeconds(40)`), a queue somebody else owns.

### Receiving

```ts
// a long-running process — `docker compose`, `pnpm dev`, a container
{
  strategy: new SqsStrategy({
    queueUrl: aws.inboundQueueUrls,                 // the application's registerAs('aws')
    clientConfig: aws.client,
  }),
}

// a Lambda: no queueUrl, because the invocation brings the records
export const handler = queueHandler(booted);      // @nestposts/lambda
```

No deserializer: Nest's own `IncomingRequestDeserializer` reads the body back as `{ pattern, data }`,
and `@Payload()` is the envelope.

`queueUrl` also takes a **list**, because a process can serve several queues where a function serves
exactly one. Be careful what that buys: SQS orders messages *within* a queue, so a consumer that
appends to the event store on an entity's condition wants one queue and not several —
`infra/aws/messaging/queues.ts` has that failure measured.

Same class, same `processRecord`, same controllers — so what local development exercises is what
deploys. The polling loop deletes what succeeded and leaves what failed, which is the whole of the
acknowledgement protocol: an undeleted message comes back when its visibility timeout runs out.

**`batch: { partialResponses: true }` is not optional on the Lambda's event-source mapping.** Without
it AWS ignores `batchItemFailures` and decides the whole batch by whether the invocation threw — so
one poison message redrives the nine that succeeded beside it, and a handler that returns instead
deletes the one that failed.

A record whose handler threw fails, and SQS redelivers it after the queue's visibility timeout. Because
the ingestion is one transaction, the failed attempt left no inbox row behind, and the redelivery is
acted on. The strategy has no opinion about what a particular failure means; a service that wants one
— a poison message to drop, a rate limit to wait out — says so with `@RetryPolicy`
(`@nestposts/retry-policy`), where the failure is understood, rather than in a transport that only
sees an exception.

### The binding is a filter policy

A queue has no bindings, so the selection happens twice and in two places: the **subscription**
decides what reaches the queue, and the **strategy** matches the routing key against the handlers'
patterns once it is there. `SnsFilterPolicy` is the first half, built from the same namespace or
event class `@EventPattern` takes:

```ts
SnsFilterPolicy.everyEventOf(POSTS_NAMESPACE)      // { namespace: ['posts'] }         ← posts.#
SnsFilterPolicy.everyEventOf(PostCreatedEvent)     // { qualifiedName: [...] }          ← posts.PostCreated.*
SnsFilterPolicy.everyEventNamed('posts.PostCreated')  // the same, for infrastructure code
SnsFilterPolicy.exceptFrom('tagging')              // { origin: [{ 'anything-but': [...] }] }
```

`exceptFrom` is an **economy, not a guard**: the origin mark on the message is what stops a service
ingesting its own echo, and this is what stops it being delivered, stored and read first.

**Turn raw message delivery on.** Without it SNS wraps every message in a notification of its own and
the message attributes never reach SQS — which is what the filter policy reads. Nothing unwraps that
notification any more: the body is not `{ pattern, data }`, and `SqsStrategy` fails the record with
`SQS message … carries no pattern` until the redrive policy moves it to the dead-letter queue.

### What a message looks like

```
message attributes  namespace      posts                        ← what the filter policy reads
                    qualifiedName  posts.PostCreated
                    messageType    posts.PostCreated#2.0.0
                    routingKey     posts.PostCreated.9f1d…
                    origin         tagging

FIFO                MessageGroupId          posts/9f1d…         ← the outbox message's key
                    MessageDeduplicationId  0f0d2a5e-…          ← the envelope's id

body                {"pattern":"posts.PostCreated.9f1d…",
                     "data":{"id":"0f0d2a5e-…","topic":"posts.PostCreated","key":"posts/9f1d…",
                             "headers":{"cqrs-transport-message-type":"posts.PostCreated#2.0.0",
                                        "cqrs-transport-origin":"tagging",
                                        "correlationId":"7b2c…",
                                        "x-tenant":"acme","traceparent":"00-4bf9…-01", …},
                             "createdAt":1788868800000,
                             "payload":{"postId":"9f1d…","title":"Nest","version":2,
                                        "occurredAt":{"@date":"2026-09-08T12:00:00.000Z"}}}}
```

The headers are in the body rather than in the attributes because ten is not enough: five framework
keys, correlation, causation, the tenant, whatever the application's context declares and
`traceparent` are more than that before anybody adds anything. A wire format that spent an attribute
per key would work until the eleventh was added, on whichever service happened to add it. Only the
five routing facts are lifted out, because they are what a filter policy can read, and the only thing
it can read.

### Locally

`docker compose up -d localstack` brings up SNS and SQS and creates the topology —
`docker/localstack/init/10-messaging.sh`, which is the same FIFO topic, the same queues and the same
filter policies `infra/aws/messaging/` deploys. Then:

```bash
export AWS_ENDPOINT_URL=http://localhost:4566
export AWS_REGION=us-east-1
POSTS_TRANSPORT=aws TAGGING_TRANSPORT=aws pnpm dev
```

Each application's `config/aws.config.ts` is what makes that enough: with an endpoint set and no key
in the environment it gives the clients the pair LocalStack documents (`LOCALSTACK_CREDENTIALS`),
because the SDK refuses to run without credentials and says so in a message that reads like a broken
deployment.

---

## On Inngest: the event is the message, and the function is the binding

`OutboxPackets.inngest` makes an `InngestRecord`:

| | |
|---|---|
| the event's `name` | the **qualified** name, `posts.PostCreated` — not the routing key: Inngest matches a trigger by exact name and has no wildcards, so a name carrying the entity would mint one event name per post |
| the event's `data` | the envelope, exactly as every other transport carries it |
| the event's `id` | the envelope's id, as idempotency key: a relay that publishes the same message twice sends one event as far as Inngest is concerned |
| `meta.sessions.correlation_id` | the message's `correlationId` — or the legacy `cqrs-transport-correlation-id` of an older row — Inngest's own grouping, which it propagates to every event a run sends |

On the receiving side `InngestStrategy` takes no deserializer either: Nest's default hands the handler
the event's `data`, which is the envelope. `inngestTriggers` turns each binding into the triggers a
function can declare — `posts.#` into one trigger per registered `@EventType` of the namespace,
`posts.PostCreated.*` into `posts.PostCreated` — and a function takes at most ten, past which the
strategy refuses to start rather than serve traffic nothing triggers.

---

## Subscriptions across processes

A `SubscriptionBus` stream is fed by the `EventBus`, which is **one per process**. For a service that
is one process that is exactly right. It stops being right the moment the service runs as several — a
function per trigger, a few replicas — because a subscriber is connected to one of them and the
container that closes a choreographed saga is usually another.

The answer is not a second port. It is that **the bus reads the event store**, so a handler writes
what `@nestjs/cqrs` always let it write:

```ts
@SubscriptionHandler(OnPostCreated)
export class Handler implements ISubscriptionHandler<OnPostCreated> {
  constructor(private readonly eventBus: EventBus) {}

  subscribe(): Observable<PostCreatedEvent> {
    return this.eventBus.pipe(ofType(PostCreatedEvent));
  }
}
```

One option turns it on — with an event store, which is what it reads:

```ts
imports: [MikroOrmEventStoreModule],
TransportEventBusModule.forRoot({
  …,
  eventStore: { engine: MikroOrmEventStorageEngine },
  subscriptions: true,
}),
```

and `EventSourcedEventBus` takes `CommittedEvents`' place: it repoints the `EventBus`'s observable side
at the store's global order (`readAfter`), in `onApplicationBootstrap`. `apps/posts-api` does that only
when `POSTS_SUBSCRIPTION_SOURCE=feed`; otherwise it has no event store at all.

**Every tenant's events are in the one store**, and each is read back with its metadata — the request
it was published in, the tenant included. The storage engine fills `x-tenant` in from the row's tenant
when the metadata does not say, so a subscription tells one tenant's `PostCreated` from another's by
`EventMessage.of(event).metadata` (`PostRequest.tenantOf(event)` in posts-api).

**And each carries the trace it was published in**, because the trace is metadata too:
`EventTrace.of(event)` is a context a span can start in, which is what lets a subscriber's delivery be
part of the trace of the request that caused the event, in another container, seconds later.

The store is appended in the unit of work's `PREPARE_COMMIT`, inside its transaction, so a subscriber in
another container reads an event only once the work that raised it has committed.

### The three readers of a bus are not the same reader

This is what makes it safe, and it is the whole design:

| who | reads | gets |
|---|---|---|
| `@EventsHandler` | `subject$`, directly, inside `bind()` | **this process** |
| a saga | the observable, **at registration** | **this process** |
| anything that pipes the bus — a `@SubscriptionHandler` | the observable | **the store** |

A projection must run once per event: delivered to every container's bus it would be written as many
times as there are containers. A saga must dispatch once, for the same reason — and it does, because
`CqrsModule` hands every saga its observable during its own bootstrap, before this one repoints the
source. A subscription is the opposite: the container holding the stream open is usually not the one
that did the work.

`src/subscriptions/event-sourced-event-bus.spec.ts` asserts all three, so a Nest upgrade that moves a
saga's subscription out of registration fails a test rather than duplicating commands in production.

### A position is taken at insert and seen at commit

`position` is a `bigserial`: a row takes its number when it is inserted and becomes visible when its
transaction commits, and those are not the same order. Measured, with two concurrent appends: the
slower transaction took position 100 and stayed open, the faster took 101 and committed, a read of
`> 99` saw only 101 and the cursor moved there — and 100, when it committed, was already behind it. So
a position missing from a read is remembered and asked for again (`gaps`), until `gapTimeout`, because
a gap a rolled-back transaction left is a number no row will ever carry.

### A new subscriber starts at the head

The cursor is in memory and dies with the process. A subscriber gets what happens from the moment it
subscribed, which is what a subscription means, and one that went away is not owed what it missed.

### One thing to know before pointing a suite at it

`apps/posts-api`'s e2e asserts the **`EventBus` subscriber count** — that opening a subscription adds
one observer, that two subscribers of one topic share a single one, that unsubscribing removes it on
the spot. Those assertions are about `subject$`, and with the store-backed bus they are false by
construction: the subscription reads the store. The suite runs in the default mode, which is the mode
it describes; running it with `POSTS_SUBSCRIPTION_SOURCE=feed` fails those tests for that reason and
not because anything is broken.

---

## Adding a transport

**One function on the way out, and nothing of this library on the way in.** A transport is a Nest
`ClientProxy` and a Nest server; what this library adds is how an outbox message becomes that client's
packet — a `toPacket` for `ClientProxyTransport`, answering `{ pattern, data }`, with the transport's
own record as `data` when it has headers or keys of its own:

```ts
const kafka = ClientProxyTransport(KafkaEventsClient, {
  toPacket: (message: OutboxMessage, envelope: OutboxEnvelope) => ({
    pattern: message.topic,                                     // the qualified name, posts.PostCreated
    data: { key: message.key, value: envelope, headers: envelope.headers },
  }),
});
```

The qualified name arrives as `message.topic`, which Inngest uses as it is; a broker that binds by
entity — RabbitMQ, SNS — is sent `EventAddress.ofMessage(message).routingKey` instead, which is the
only place that has a reason to know. `OutboxPackets` holds the three brokers this repository uses, and
`OutboxPackets.for(kind)` is how a destination picks one.

On the way in, whatever the transport's server hands `@Payload()` has to be the envelope — its default
deserializer, usually, since the envelope is plain JSON. If it is not, `EventIngestion` refuses the
message by name instead of ingesting nothing.

Nothing else changes — not the outbox, not the relay, not the envelope, not the ingestion.

---

## Axon 5 → this library

What is ported is Axon 5's semantics, not every class that carries them. A row that says **not
ported** is a construct nothing in this repository used: each class among them is a subclass of an
abstract class that is here — `SequencingPolicy`, `TagResolver`, `CorrelationDataProvider` — and a few
lines of the application that needs it, and the two `AppendCondition` methods had no caller.

| Axon Framework 5 | here | what differs |
|---|---|---|
| `UnitOfWork` | `UnitOfWork` | none in the rules; `execute()` runs once, `executeWithResult` answers once committed |
| `ProcessingLifecycle`, `DefaultPhases` | `ProcessingLifecycle`, `DefaultPhases` | the same phases and orders |
| `ProcessingContext`, `Context.ResourceKey` | `ProcessingContext`, `ResourceKey` | an explicit parameter in Axon; here carried in an `AsyncLocalStorage`, because `execute(command)` and `handle(event)` have no parameter for it — and never used to join units |
| `ResourceOverridingProcessingContext` | the same name | |
| `ProcessingLifecycleInterceptor` | the same name | |
| `UnitOfWorkFactory`, `SimpleUnitOfWorkFactory`, `TransactionalUnitOfWorkFactory` | the same names | the transactional one also makes a unit `sequential` when the manager asks |
| `TransactionManager`, `Transaction` | the same names, as a port | a `Transaction` also has `handle`, `run`, `afterCommit` and `runAfterCommit`; the manager is told the message; `detached()` |
| `EntityManagerTransactionManager` (JPA) | `MikroOrmTransactionManager` (`@nestposts/outbox-mikro-orm`) | a MikroORM transaction is a callback, so it is opened and left waiting on the unit's decision |
| `Message`, `EventMessage`, `CommandMessage`, `MessageType`, `Metadata` | the same names | a message travels attached to its payload, because `@nestjs/cqrs` hands handlers the payload |
| `CorrelationDataProvider`, `MessageOriginProvider` | the same names | plus `ForwardedMetadataProvider` |
| `SimpleCorrelationDataProvider` | not ported | nothing here used it; a subclass of `CorrelationDataProvider` copying a fixed list of keys is a few lines |
| `CorrelationDataInterceptor` | the same name | |
| `MessageDispatchInterceptor`, `MessageHandlerInterceptor` | the same names | dispatch is synchronous |
| `SimpleCommandBus`: a unit per command | `UnitOfWorkCommands`, decorating `@nestjs/cqrs`'s `CommandBus` | the instance is decorated, never replaced |
| `EventSink`, `SimpleEventBus` | `TransportEventBusService`, an `IEventBus` | its `PREPARE_COMMIT` also appends to the store and writes the outbox |
| `SubscribingEventProcessor` | `LocalEventDelivery` | delivers through `@nestjs/cqrs`'s `EventBus` |
| `PooledStreamingEventProcessor`, `TokenStore` | `StreamingGroupDelivery`, on `@nestjs/outbox`'s relay, leases and inbox | no replay: its messages are written at publish time and deleted once handled |
| processing groups, `SequencingPolicy`, `ErrorHandler` | `@ProcessingGroup` + `processingGroups`, `SequencingPolicy`, `ErrorHandler` | a saga declares its events on its group |
| `SequentialPerAggregatePolicy` | `SequentialPerEntityPolicy` | reads the first tag |
| `SequentialPolicy`, `HierarchicalSequencingPolicy` | the same names | `DefaultSequencingPolicy` is `HierarchicalSequencingPolicy(SequentialPerEntityPolicy, SequentialPolicy)` |
| `FullConcurrencyPolicy`, `MetadataSequencingPolicy` | not ported | nothing here used them; a subclass of `SequencingPolicy` is a few lines where an application needs one |
| dead-letter queue | `@nestjs/outbox`'s dead letters | |
| `EventStore`, `EventStoreTransaction`, `EventStorageEngine` | the same names | the engine is a port the application implements |
| `Tag`, `TagResolver`, `AnnotationBasedTagResolver` | the same names | the annotation is `@EventType({ tags })`, on the class |
| `MetadataBasedTagResolver`, `MultiTagResolver` | not ported | nothing here used them; a subclass of `TagResolver` is a few lines where an application needs one |
| `EventCriteria`, `ConsistencyMarker`, `AppendCondition` | the same names | `AppendCondition` has `none()` and `withMarker()` only |
| `AppendCondition.withCriteria`, `orCriteria` | not ported | the unit's `EventStoreTransaction` widens its criteria itself (`EventCriteria.or`) and builds the condition once, so nothing called them |
| `AppendEventsTransactionRejectedException` | `AppendEventsTransactionRejectedError` | |
| `EventSourcingRepository`, `@EventSourcedEntity(tagKey)` | `EventSourcingRepository`, `eventStore.entities: [{ entity, tagKey }]` | declared at the root, because the entity's library knows nothing of this one; no `@EntityCreator` — a replay starts from `new Entity()` |
| `@EventSourcingHandler` | the aggregate's `on<Event>` methods, through `loadFromHistory` | `@nestjs/cqrs`'s |
| Axon Server, as the transport | the brokers, through `@nestjs/outbox` | the envelope on each wire (`OutboxPackets`), the origin mark, and `EventIngestion`, where a delivery becomes a unit of work |

---

## What is gone, and what took its place

For whoever knew this library before; `NOTICE.md` has the reasons.

| before | now |
|---|---|
| `UnitOfWork.run(work, request, options)`, a unit **joined** by any work carrying the same request (`covers`) | a unit per command, per ingested message, per streaming delivery — `UnitOfWorkFactory.create().executeWithResult(…)`; what crosses is correlation data |
| `track`, `failOnTrackedFailure` | `DeliveryScope`: a delivery waits for its handlers and its sagas' commands, and hands each failure to its group's error handler |
| the phases `started`, `prepareCommit`, `commit`, `afterCommit`, `rollback`, `cleanup` | Axon 5's `DefaultPhases`, and `onError` / `whenComplete` / `doFinally` |
| `UnitOfWorkTransaction`, `transaction: MikroOrmUnitOfWorkTransaction`, `transactionHandle` | `TransactionManager`, `transactionManager: MikroOrmTransactionManager`, `TransactionManager.handleOf(context)` |
| the local handlers told **after** the commit | the subscribing groups told in `PREPARE_COMMIT`, inside the transaction; streaming groups through the outbox |
| `LocalDelivery`: every destination message routed `local` in a service with no broker, delivered back to its own bus | no destination message written for a namespace with no transport; a streaming group's own `@processing-group` messages, delivered by `StreamingGroupDelivery` |
| `EventLog`, `MikroOrmEventLog`, `eventLogEntities`, `stream_id` / `sequence`, `trace_context` | `EventStore` on the application's `EventStorageEngine` — `MikroOrmEventStorageEngine`, `eventStoreEntities` — `tags text[]`, `metadata jsonb` |
| `EventSourcedRepository.of(Post)`, `eventStore: [Post]` | `EventSourcingRepository`, `eventStore: { engine, entities: [{ entity: Post, tagKey: 'postId' }] }` |
| the log refusing a second creation by reading a stream's first row | nothing: the inbox and the store's unique identifier drop a redelivery, and a creating command that must be unique says so in its own append condition |
| `CorrelatedRequestContext`, `decode`, `correlationIdOf`, `CORRELATION_ID`, `CAUSATION_ID` | `DefaultRequestContextCodec` (`toMetadata`, `fromMessage`, `contextFor(message)`), and correlation data (`MessageOriginProvider`) |
| `cqrs-transport-correlation-id`, `cqrs-transport-causation-id` on the wire | `correlationId`, `causationId`; the old keys still read |
| `TransportRequestContext.toAttributes()` deciding what a service forwards | `ForwardedMetadataProvider`, which `TransportRequestContext` also answers with |
| `messageOf`, `reconstruct`, `rebuild`, `restore`, `markIdentified` | `EventMessages.read(envelope)`: the `EventMessage`, its payload the real class, under the identifier it was raised with |
| `TransportTenantResolver`, in this library | `MessageTenantResolver`, in `@nestposts/database`, reading the envelope by its shape |
| `batchSize` in the bus's outbox settings | a drain that loops while a round publishes something |
| `startInProcessService` creating the spec's schema itself (`createSchema`) | `startInProcessService(module, { onStart, onClose })`, and `testSchemaLifecycle` |
| `@Publisher(namespace)`, `EVERY_NAMESPACE`, `ITransportPublisherEventBus` | the root `OutboxModule`'s `transports`, and `outbox.destinations` naming the same namespaces |
| `EventForwarder` (a direct emit) | nothing: `EventOutbox` writes, the relay sends |
| `EventEnvelope` / `EventEnvelopeFactory`, every `*EventEnvelopeSerializer` / `*Deserializer` | `@nestjs/outbox`'s `OutboxEnvelope`, `OutboxPackets` out, the transports' default deserializers in |
| `@TransportEvent()` / `TransportEventPipe` | `@Payload() envelope: OutboxEnvelope`, and `EventIngestion.ingest(envelope)` |
| `MessageInbox` / `MikroOrmMessageInbox`, `transport.transport_message_inbox` | `@nestjs/outbox`'s `OutboxInbox` over `MikroOrmOutboxStore`, `transport.outbox_inbox` |
| `MemoryClient` as a destination | no transport, and a suite delivers on `TopicMemoryServer.emit` |

---

## Reference

### What the application declares

The options of `forRoot` are the table in **Start it**, above; under them are the bindings the library
asks for — `TransportIdentity` (required), `RequestContextCodec` (defaulted), `TransactionManager`
(`transactionManager`), `InboxDescriptions` (`inbox.descriptions`), `EventStorageEngine`
(`eventStore.engine`) — and what it expects the application to have declared at its root:
`@nestjs/cqrs` (`CqsrsModule.forRoot`), and, for a service with an inbox or an outbox,
`@nestjs/outbox`'s `OutboxModule` with a store registered with it (`MikroOrmOutboxModule`).

It binds always `UnitOfWorkFactory`, `UnitOfWorkCommands`, `MessageInterceptors`, `TagResolver`,
`SequencingPolicy`, `EventMessages`, `ProcessingGroups`, `EventHandlingComponents`,
`LocalEventDelivery` and `CommittedEvents` (or `EventSourcedEventBus`, with `subscriptions`);
`EventIngestion` with an inbox; `EventOutbox` and `StreamingGroupDelivery` with an outbox; `EventStore`
and a repository per entity with an event store.

It exports the bus itself (`TransportEventBusService`, and `TRANSPORT_EVENT_BUS_PUBLISHER` bound to
it), `IncomingRequest`, `RequestContextCodec`, `MessageInterceptors`, `UnitOfWorkFactory`,
`TagResolver`, `SequencingPolicy`, `EventMessages`, `ProcessingGroups`, and whatever of the rest the
options turned on.

### The pieces you will name

| | |
|---|---|
| `@EventType` (in `@nestposts/platform`) | the event's identity on the wire, its tags, and its namespace is its route |
| `TransportEventBusModule.forRoot` / `.forRootAsync` | the whole mechanism, started in one call |
| `UnitOfWork` / `UnitOfWorkFactory` / `DefaultPhases` / `ProcessingContext` / `ResourceKey` | Axon 5's unit of work, where units come from, its phases, its context and its resources |
| `TransactionManager` / `Transaction` / `NoTransactionManager` | the port a unit's transaction comes from, and the unit without one |
| `MikroOrmTransactionManager` (`@nestposts/outbox-mikro-orm`) | that port on MikroORM: savepoints, `REQUIRES_NEW`, the tenant, the after-commit handover |
| `UnitOfWorkCommands` | every command in a unit of its own |
| `EventMessage` / `CommandMessage` / `MessageType` / `Metadata` | the message model |
| `CorrelationDataProvider` / `MessageOriginProvider` / `ForwardedMetadataProvider` | what a handled message passes on |
| `MessageDispatchInterceptor` / `MessageHandlerInterceptor` | what sees every message dispatched, and every message handled |
| `RequestContextCodec` / `DefaultRequestContextCodec` / `TransportRequestContext` / `ContextAttributes` | `@nestjs/cqrs`'s request and a message's metadata, both ways |
| `@ProcessingGroup` / `ProcessingGroups` | a handler's group, and what processes each |
| `ErrorHandler` / `PropagatingErrorHandler` / `LoggingErrorHandler` | what a group does with a failure |
| `SequencingPolicy` / `DefaultSequencingPolicy` / `SequentialPerEntityPolicy` / `SequentialPolicy` / `HierarchicalSequencingPolicy` | what is handled in order: the outbox key |
| `LocalEventDelivery` / `StreamingGroupDelivery` / `DeliveryScope` | the subscribing processor, the streaming one, and one delivery with everything it set off |
| `CommittedEvents` | what a subscription hears: events that committed |
| `EventStore` / `EventStorageEngine` / `EventSourcingRepository` | the event store, its engine, and an entity loaded from its events |
| `Tag` / `TagResolver` / `EventCriteria` / `ConsistencyMarker` / `AppendCondition` / `AppendEventsTransactionRejectedError` | the dynamic consistency boundary |
| `MikroOrmEventStoreModule` / `MikroOrmEventStorageEngine` / `eventStoreEntities` (`@nestposts/event-store-mikro-orm`) | the engine on MikroORM and PostgreSQL, and its table |
| `ClientProxyTransport(Client, { toPacket })` (`@nestjs/outbox`) | a destination: the client, and how a message becomes its packet |
| `OutboxPackets.for('rabbitmq' \| 'aws' \| 'inngest')` | the packet of each broker; `OutboxPackets.inProcess` is the envelope, for a suite's client |
| `OutboxRoute.over(transports)` | the outbox's route: a streaming group's message and a namespace with no transport go `local` |
| `EventMessages` | what an event becomes on the wire — a destination's message, a group's — and what an envelope becomes back (`read`) |
| `EventOutbox` | where the events a unit staged are written, and what happens after its commit |
| `TransportOutboxSettings` / `OutboxRelayMode` | the relay's place in the process — `poll`, `drain`, `off` — and the root's route |
| `InboxDescriptions` | where an admitted message's type and origin are noted beside its inbox row — optional |
| `MikroOrmOutboxModule` / `MikroOrmOutboxStore` / `outboxEntities` (`@nestposts/outbox-mikro-orm`) | `@nestjs/outbox`'s two storage contracts on MikroORM, scoped by producer, and their three tables |
| `OutboxEnvelope` (`@nestjs/outbox`) | what crosses: `id`, `topic`, `key`, `headers`, `createdAt`, `payload` |
| `EventIngestion.ingest(envelope)` | what a controller calls |
| `envelopeOf` / `EventMessages.read` / `instantiate` | the envelope checked, read back as a message, and its payload rebuilt as the real class |
| `IncomingRequest` | the request a message belongs to — `from(envelope)` in a controller, `of(context)` in a guard, an interceptor or a filter, `traceOf` for the trace |
| `MessageTenantResolver` (`@nestposts/database`) | the tenant a message names, read off the envelope for `TenancyModule` |
| `EventAddress.everyEventOf(namespace)` / `.everyEventOf(EventClass)` | the binding: `posts.#`, or `posts.PostCreated.*` |
| `EventAddress` | what an event says about itself — its message type, its tags and its `routingKey`; `ofMessage` reads the same back off an outbox message |
| `SnsClientProxy` / `SqsClientProxy` (`@nestposts/microservices-aws`) | a topic for a fact, a queue for a message addressed to one service |
| `SqsStrategy` / `processSqsEvent` (`@nestposts/microservices-aws`) | the consumer: a polling loop, or a Lambda invocation |
| `SnsFilterPolicy.everyEventOf(...)` / `.exceptFrom(...)` | the binding, for a subscription |
| `inngestTriggers` | a binding, as the event names an Inngest function can trigger on |
| `TraceContextDispatchInterceptor` / `injectTraceContext` / `isTraceContext` / `EventTrace` / `ingesting` | the trace in the metadata, what must not be forwarded, the trace an event was published in, and the consumer span |
| `EventSourcedEventBus` | the `EventBus` whose observable side is the event store |
| `isIngested` / `originOf` / `identifierOf` | what an event says about where it came from |
| `startInProcessService` / `RecordingClient` / `publishedEnvelope` (`/testing`) | the doubles |
| `TopicMemoryServer` (`@nestposts/microservices-memory`) | the memory transport's server: a routing key matched against every binding, each delivery a JSON copy |

### Environment

None of it is read by this library: each application reads its own, in its `config/`, and hands the
library settings.

| | |
|---|---|
| `<APP>_OUTBOX_RELAY` | `poll` \| `drain` \| `off` — `POSTS_`, `TAGGING_` (default `poll`) and `WEB_` (default `drain`) |
| `<APP>_OUTBOX_POLL_INTERVAL_MS` | `POSTS_`, `TAGGING_`; default 1000 |
| `<APP>_OUTBOX_RETRY_ATTEMPTS` | `POSTS_`, `TAGGING_`, `WEB_`; default 20 |
| `POSTS_SUBSCRIPTION_SOURCE` | `local` (default) \| `feed` — `feed` gives posts-api an event store and `subscriptions: true` |

`AWS_ENDPOINT_URL` points the SNS and SQS clients at LocalStack and is what makes the AWS transport
usable without an account; `AWS_REGION` and the credentials are the SDK's own, except that a local
endpoint with no key in the environment gets LocalStack's documented pair rather than a
`CredentialsProviderError`. Each application reads it in its own `config/aws.config.ts` and hands the
clients a `clientConfig`.
