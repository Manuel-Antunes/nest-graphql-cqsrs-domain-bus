# @nestposts/transport-eventbus

**The CQRS event bus, speaking through Nest's microservice transports — by way of an outbox.**

A domain event raised inside a command handler reaches the handlers, sagas and subscriptions of this
process — and, when its namespace has a destination, the other services as well. It does not reach
them by being sent: it is **written**, as a message of
[`@nestjs/outbox`](https://github.com/nestjs/outbox), in the transaction of the work that
raised it, and the outbox's relay publishes it once that transaction has committed. Nothing in the
domain or in the handlers has to know: the integration point is `IEventBus` itself.

This library is a vendored and adapted copy of
[nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus) by Sergey
Telpuk (MIT), plus an integration layer, and since `@nestjs/outbox` was published that package does
the publishing and the remembering that upstream's destinations and this repository's inbox used to
do. [`NOTICE.md`](./NOTICE.md) is the account of what came from upstream, what the new versions
forced, and what was added here; this file is how to use it.

| | |
|---|---|
| publishing | `TransportEventBusService` (an `IEventBus`) stages the events in the unit of work → `EventOutbox` writes one outbox message per event in the unit's transaction (`EventMessages`) → `@nestjs/outbox`'s relay → the namespace's `ClientProxyTransport` → your `ClientProxy`, carrying the transport's own record (`OutboxPackets`) |
| receiving | the transport's own deserializer → your `@EventPattern` controller, `@Payload() envelope: OutboxEnvelope` → `EventIngestion.ingest(envelope)` → one unit of work in one transaction: the `OutboxInbox` row, the `EventLog` append, the local `EventBus` and every reaction it sets off |
| what crosses | `@nestjs/outbox`'s `OutboxEnvelope` — `id`, `topic`, `key`, `headers`, `createdAt`, `payload` — as the `data` of Nest's own `{ pattern, data }` |
| what keeps it once | on the way out, the outbox: the row commits with the work, and the relay retries it until a broker takes it. On the way in, the origin mark, the inbox and your aggregate |

One module function, one controller shape, and the one decorator the domain already carries
(`@EventType`, the platform's). What the library needs from the application it asks for as
options: who the service is, which namespaces leave through which client, and what it makes durable.

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

`namespace.Name#version` — `posts.PostPreCreated#1.0.0` — is the event's identity outside this
process. `name` defaults to the class name without the `Event` suffix, `version` to `1.0.0`.

The **namespace is also the route**: the outbox's destinations are keyed by namespace, and that is
the whole routing (step 3). An event whose namespace has no destination stays in this process, which
is the right default for the events a domain is mostly made of — and so does an event with no
`@EventType`, which has no namespace at all. The qualified name, `posts.PostCreated`, is the outbox
message's `topic`.

`tags` names the properties that identify **which aggregate** the event is about. It is the last
segment of the routing key, so a consumer can bind to one post's stream; it is the outbox message's
ordering key, so one aggregate's events are published in the order they were committed; and it is
what the other side uses to know what the event belongs to. One tag per event: an event about two
aggregates cannot be ordered by either.

### 2. Start it

The bus stands on two things it does not declare: `@nestjs/cqrs` — here through `CqsrsModule` — and
`@nestjs/outbox`, with a store behind it. The application declares both at its root, and the bus uses
them:

```ts
import { Module } from '@nestjs/common';
import { OutboxModule } from '@nestjs/outbox';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule } from '@nestposts/database';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmUnitOfWorkTransaction,
  OutboxHousekeepingModule,
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
    OutboxModule.forRoot({                                // @nestjs/outbox, global — step 3
      imports: [PostEventsClientModule],
      transports,
      route: OutboxRoute.over(transports),               // a namespace with no transport goes `local`
      relay: { enabled: true },
    }),
    MikroOrmOutboxModule.forRoot({ producer: 'tagging' }), // its store and its three tables
    OutboxHousekeepingModule.forRoot({}),                 // what the package leaves to you
    TransportEventBusModule.forRoot({
      identity: 'tagging',                                // or a TransportIdentity of its own
      transaction: MikroOrmUnitOfWorkTransaction,         // what every unit of work runs in
      inbox: { descriptions: MikroOrmOutboxStore },       // receiving on
      outbox: { destinations: PostEventsClient.namespaces }, // publishing beyond this process on
      eventStore: [Post],                                 // the aggregates it sources from the event log
    }),
    PostEventsClientModule,
  ],
})
export class AppModule {}
```

| option | | |
|---|---|---|
| `identity` | required | who this service is on the wire: a name, or a `TransportIdentity` (`.silent('my-suite')` for a spec) |
| `publishes` | `true` | the master switch of the outbound half, when the identity is a plain name |
| `requestContext` | `CorrelatedRequestContext` | what a request means here |
| `transaction` | — | the `UnitOfWorkTransaction` for the application's ORM — `MikroOrmUnitOfWorkTransaction`. Every command, every ingested message and every publish nobody staged runs in it, and the outbox and the inbox write through its handle |
| `inbox` | — | `true`, or `{ descriptions }`, turns **receiving** on: `EventIngestion`, which admits each message through the application's `OutboxInbox`, keyed by this service's name and the envelope's id. `descriptions` is where each message's type and origin are noted beside it (`InboxDescriptions`) |
| `outbox` | — | turns **publishing beyond this process** on: `destinations`, the namespaces this service publishes — the keys of the root `OutboxModule`'s `transports` when it has a broker — and the settings (`inject` + `useFactory`, answering `TransportOutboxSettings`). A destination the outbox has no transport for goes to its `local` transport, where `LocalDelivery` tells it to the `EventBus` — and the settings' `route`, the outbox's own, is what keeps the commit from telling it too. Without it the bus publishes to this process only |
| `eventStore` | — | the aggregates this service event-sources; given, the `EventLog` is wired, with an `EventSourcedRepository` per aggregate |
| `subscriptions` | — | binds the `EventBus` token to `EventSourcedEventBus` — see **Subscriptions across processes** |
| `imports` / `providers` / `exports` | `[]` | whatever the above depend on |

`forRootAsync` is the same with the identity resolved at runtime — from the application's
configuration, a secret, a discovery agent. Every application here builds it, and the outbox around it,
from its `registerAs` configs:

```ts
OutboxModule.forRootAsync({
  imports: [PostEventsClientModule],
  transports: PostEventsClient.destinations(appConfig()),
  inject: [appConfig.KEY, outboxConfig.KEY],
  useFactory: (app: AppConfig, { relay, pollInterval, retry }: OutboxConfig) => ({
    route: PostEventsClient.route(app),                   // OutboxRoute.over(PostEventsClient.destinations(app))
    relay: { enabled: relay === 'poll', pollInterval },
    retry,
  }),
}),
MikroOrmOutboxModule.forRootAsync({
  inject: [appConfig.KEY],
  useFactory: ({ name }: AppConfig) => ({ producer: name }),
}),
OutboxHousekeepingModule.forRootAsync({
  inject: [outboxConfig.KEY],
  useFactory: ({ relay, inboxRetention }: OutboxConfig) => ({
    interval: relay === 'poll' ? '1h' : false,
    inboxRetention,
  }),
}),
TransportEventBusModule.forRootAsync({
  inject: [appConfig.KEY],
  useFactory: ({ name, publishes }: AppConfig) => TransportIdentity.named(name, { publishes }),
  transaction: MikroOrmUnitOfWorkTransaction,
  inbox: { descriptions: MikroOrmOutboxStore },
  outbox: {
    destinations: PostEventsClient.namespaces,
    inject: [appConfig.KEY, outboxConfig.KEY],
    useFactory: (app: AppConfig, { relay }: OutboxConfig) => ({
      relay,
      route: PostEventsClient.route(app),                 // the root OutboxModule's route, the same one
    }),
  },
}),
```

Only the identity is async, and that is not a limitation: everything else is a class or a provider, and
a provider resolves its own dependencies — the outbox's settings are an ordinary `useFactory` with an
`inject`. What cannot wait is module metadata, which Nest reads before anything is instantiated, and the
root `OutboxModule`'s `transports` are module metadata: it has to know them to build them. That is why
the applications compute them by calling their config factory, `appConfig()`, the way `CLAUDE.md` says
a value needed before the container exists is read.

Seven things to know:

- **`applicationName` is the mark of authorship, not an address.** Where a message goes is its
  namespace's destination; the name is what every message carries *from* this service
  (`cqrs-transport-origin`), what this service's inbox rows are kept under (the consumer), and — as the
  store's `producer` — what its outbox rows are kept under. A service that binds a namespace it also
  publishes to receives its own events, and without the mark it ingests them, writing its own state
  again and deciding twice. Two services must not share it — they would swallow each other's events,
  share one memory of what was ingested and relay each other's outbox — and there is no default because
  a wrong name is worse than a missing one.
- **The outbox is used, never configured, here.** The bus injects `Outbox`, `OutboxRelay` and
  `OutboxInbox` from the global `OutboxModule` the application declared. It cannot `imports:
  [OutboxModule]` instead: the bare class is a second, unconfigured instance of a module whose
  providers need its options. An `inbox` or an `outbox` without the root `OutboxModule` fails the boot,
  naming the provider it could not resolve.
- **The tables come with the modules that own them.** `MikroOrmOutboxModule` brings `@nestjs/outbox`'s
  three (`outboxEntities`: `outbox_messages`, `outbox_dead_letters`, `outbox_inbox`), and `eventStore`
  or `subscriptions` brings the event log's (`eventLogEntities`), each through
  `DatabaseModule.forFeature` (`@nestposts/database`) — so a table is never something an application
  copies into its configuration. A service with neither an outbox nor a log needs no database at all,
  and publishes to nobody but itself.
- **Every unit of work is a transaction.** `transaction` binds `UnitOfWorkTransaction`
  (`unit-of-work/`, this library's port) to the application's implementation, so every command
  `UnitOfWorkCommands` wraps and every message `EventIngestion` admits runs inside one: what the
  handlers flush, the event log append and the outbox rows commit together or not at all. The unit keeps
  the transaction's handle (`transactionHandle`), and that is what `Outbox.add(tx, …)` and
  `OutboxInbox.processInTransaction(tx, …)` receive.
- **Nothing imports `CqrsModule`**: the `EventBus` comes from wherever your application put CQRS.
  `CqrsModule.forRoot()` and `CqsrsModule.forRoot()` are global, so that is enough — and importing the
  static `CqrsModule` inside a provider's module would give it a *second* `EventBus`, which fails
  silently (see `NOTICE.md`).
- **The module is global**, because what it provides is injected from everywhere: a command handler asks
  for `TRANSPORT_EVENT_BUS_PUBLISHER`, a controller for `EventIngestion`, a guard for
  `IncomingRequest`, an on-demand notification for `UnitOfWorkTransaction`.

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
      return {};                                        // no broker: every namespace goes `local`
    }
    const transport = ClientProxyTransport(PostEventsClient, {
      toPacket: OutboxPackets.for(app.transport),       // 'rabbitmq' | 'aws' | 'inngest'
    });
    return Object.fromEntries(
      PostEventsClient.namespaces.map((namespace) => [namespace, transport]),
    );
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
that is the root `OutboxModule`'s `imports`. The application imports the same module again for whatever else injects it —
in the applications here the `Inngest` client, which the inbound strategy serves functions from and
the proxy sends through. A static module is one instance however many modules import it, so the relay
publishes through the same client the rest of the application sees.

**The route is the event's.** The outbox's `route` is `OutboxRoute.over(transports)`, which reads the
namespace off the message type the event declared, and picks the destination under that key. There is
no class naming which events go where, so there is no second declaration to keep in step with the
first: a new event in a namespace that already has a destination goes out routed, with nothing added
anywhere. Two namespaces through one broker are two keys holding the same transport. One namespace is
one route, so the same namespace on two brokers is not something this map can say — fan-out of that
kind is the broker's.

**A namespace with no transport goes `local` — and reaches this process's bus through the outbox.**
`local` is `@nestjs/outbox`'s own in-process transport: the relay hands the message to the
`@OnOutboxMessage()` handlers of this process, matched by exact topic — which is why the topic is the
qualified name and not the routing key. A service running with no broker (`POSTS_TRANSPORT=memory`)
has no transport at all, so everything it publishes is relayed there, claimed, delivered and marked
published like any other message.

Such an event is **not** told to the `EventBus` at its unit of work's commit, which is where every
other event is told. The outbox tells it: the bus declares one `@OnOutboxMessage()` itself,
`LocalDelivery`, for every event of `outbox.destinations`, and it restores the event — the real
class, the identifier it was raised with, the request its headers carry, and **no** ingestion mark,
because it is this service's own decision — and publishes it on the `EventBus`, in a unit of work of
its own, in the tenant the message names, with the inbox row under this service's name. The
`@EventsHandler`s, the sagas and whatever they dispatch run then, after the commit and with what the
outbox gives a message: delivered until it is taken, retried when a handler fails, dead-lettered after
the last attempt. A namespace that leaves through a broker is told at the commit, as always.

For that the bus has to know what the outbox routes `local`, and it is told the **same** route, in
`outbox.useFactory`:

```ts
export class PostEventsClient {
  static route(app: AppConfig): OutboxRouteFunction {
    return OutboxRoute.over(PostEventsClient.destinations(app));
  }
}

OutboxModule.forRootAsync({ …, useFactory: (app: AppConfig, …) => ({ route: PostEventsClient.route(app), … }) }),
TransportEventBusModule.forRootAsync({
  …,
  outbox: {
    destinations: PostEventsClient.namespaces,
    inject: [appConfig.KEY, outboxConfig.KEY],
    useFactory: (app: AppConfig, { relay }: OutboxConfig) => ({ relay, route: PostEventsClient.route(app) }),
  },
}),
```

Without it every event is told at the commit, and `LocalDelivery` only acknowledges what still goes
`local` — with a warning, because handlers running twice is the other way it could go.

In `poll` mode the command answers before those handlers run, the way it would with a broker between
two services; in `drain` it answers after the relay has delivered them. And a request that crosses the
outbox is restored from the headers, as across a broker: a handler sees the same correlation id, the
same tenant and the same attributes, in a new `AsyncContext`.

Anything else of the application's that wants what goes `local` declares its own
`@OnOutboxMessage(qualifiedName, { consumer })`, beside `LocalDelivery`. It runs outside Nest's
enhancers — no guard, interceptor or pipe, so no tenant is opened for it:

```ts
@Injectable()
export class PostCreatedAudit {
  @OnOutboxMessage('posts.PostCreated', { consumer: 'post-created-audit' })
  record(payload: Record<string, unknown>, { message }: OutboxHandlerContext) { … }
}
```

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
    post.commit();                  // staged: into the outbox at the unit's prepare, told here at its commit
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

await this.eventBus.publish(event);                 // outside a unit: resolves once it is committed and told
await this.eventBus.publish(event, this.request);   // with the request attached
```

Inside a unit of work — a command handler, a saga's command, an ingestion — `publish` stages and
resolves at once; the unit's own promise is what covers the rest (see **Publishing is writing**).

### 5. Receive on the other side

A microservice — on its own (`NestFactory.createMicroservice`) or alongside HTTP — with nothing of this
library in its options: the transport's default deserializer already hands a handler `{ pattern,
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

  @EventPattern(EventAddress.everyEventOf(PostCreatedEvent))   // posts.PostCreated.*  — one type, any aggregate
  postCompleted(@Payload() envelope: OutboxEnvelope): Promise<void> {
    return this.ingestion.ingest(envelope);
  }
}
```

**One entry can serve a whole namespace**, and often should: the message type in the envelope's
headers is what resolves the concrete class, so one method receives every event of `posts` as the class
it is. A service that keeps another's stream wants exactly that — a binding per event type is a list
that has to grow every time the other service adds one, silently, because an event nobody bound to is
dropped by the exchange without a word. The cost is that the queue also receives what this service does
not act on, including its own events, which the origin mark drops before the inbox.

**The parameter is the envelope, and the ingestion rebuilds the event.** `@Payload()` is Nest's own,
which is `@nestjs/outbox`'s consumer pattern: the controller parses nothing, and `EventIngestion` does
the rest — `envelopeOf` checks what it was handed is an `OutboxEnvelope`, `messageOf` reads the message
off it (the id, the type, the origin, the tags, the request's headers), and `reconstruct` builds the
event as an instance of its real class, dates included, marked with where it came from. A payload that
is not an envelope — a producer that is not an outbox, a transport whose deserializer changed the
shape — is refused by name, rather than skipping the inbox. A controller that wants the event without
the ingestion calls `reconstruct(envelope)` itself.

**`IncomingRequest.from(envelope)` is the other half**: the `AsyncContext` the message belongs to,
rebuilt from the envelope's headers by the application's `RequestContextCodec`. A controller that
dispatches instead of ingesting passes it on, and the command runs in the request that opened it on
the other side of the wire:

```ts
constructor(private readonly incoming: IncomingRequest, private readonly commandBus: CommandBus) {}

@EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))
posts(@Payload() envelope: OutboxEnvelope): Promise<void> {
  return this.commandBus.execute(new CompletePost(reconstruct(envelope)), this.incoming.from(envelope));
}
```

A controller that hands the envelope to `EventIngestion` does not need it: the ingestion decodes the
same context and publishes the event **with** it, so the handlers, the sagas and the commands those
sagas dispatch are already in that request.

The ingested event is published on the **local** `EventBus`, so `@EventsHandler`, `@Saga` and the
GraphQL subscriptions see it exactly as if a local command had raised it.

**One queue per service is not a preference.** On RabbitMQ a copy is made per bound queue, not per
consumer: two applications sharing a queue compete for the messages, and whichever discards one
acknowledges it — killing it for the other.

---

## Publishing, in detail

### Publishing is writing

A command runs in a unit of work (`unit-of-work/`), and the unit runs in the transaction the
application named. That is the whole of the outbound half:

```
commandBus.execute(command)
  ┌ transaction                  MikroOrmUnitOfWorkTransaction
  │ started        the handler runs; post.commit() STAGES its events — nothing is sent
  │ prepareCommit  EventLog.append (with a log), then EventOutbox.stage → Outbox.add(tx, messages),
  │                tx being the unit's transactionHandle
  └ commit of the transaction: the handler's writes, the log and the outbox rows, together
    commit         the events reach this process: handlers, sagas, subscriptions
    afterCommit    EventOutbox.committed() — the relay, by mode (below)
```

`execute` resolves after `afterCommit`, so a caller that awaited the command has awaited its events —
committed, and in `drain` mode already published. A handler that throws rolls the transaction back and
the staged events are **discarded**: no row, no message, nothing told to this process. An event is a
fact, and the unit of work is what makes it one only once the work is.

**There is no direct emit.** The bus never talks to a broker; `EventOutbox` writes, the relay sends. A
service without `outbox` in its options publishes to its own process and nowhere else.

**A publish that no unit of work staged gets one of its own**, when at least one of its events leaves:
recorded, committed, and only then told — the same three steps a command takes. Its **own**
transaction (`EventOutbox.detached`, MikroORM's `REQUIRES_NEW`), and not a savepoint of whatever
transaction the caller is in: nobody awaits an `aggregate.commit()`, and a savepoint that outlived its
transaction fails to release — measured, `RELEASE SAVEPOINT can only be used in transaction blocks`,
from a provisioning that published inside `UserRepository.exclusively`. An event that stays in the
process takes the synchronous path it always did, so a local handler is not delayed by a microtask it
never needed.

### What one event becomes

`EventMessages` turns each event that leaves into **one** outbox message, addressed by what the event
declares and nothing else:

| | |
|---|---|
| `id` | the event's identifier — generated once per instance and remembered on it, and what every consumer's inbox deduplicates by |
| `topic` | the qualified name, `namespace.Name`: what happened. It is what `@OnOutboxMessage()` is declared with, because the outbox's `local` transport matches a handler by its exact topic |
| `key` | `namespace/aggregate`: one aggregate's messages are published one at a time, in the order their transactions committed. `null` for an event with no tag |
| `payload` | the event's fields, encoded once for JSON (`encodeData`) — a `Date` comes back a `Date` |
| `headers` | what is said about it: its type, the service that produced it, its tags, the timestamp, the request's attributes and the trace it was raised in |

The headers are **captured at staging**, and that is the point of capturing them there: the relay
publishes later, in no request and in no trace, and whatever the message is to say about the work that
raised it has to be written while that work is still the active one.

An event stays in the process when this service does not publish (`publishes: false`), when it came
from another service (the origin mark — publishing it again would be the loop the mark exists to cut),
or when no destination takes its namespace.

### Which routing key an event goes out under

`EventAddress.routingKey`, read off the event and nothing else — and off the message, by
`EventAddress.ofMessage`, when a transport's packet publishes it: the outbox's topic is the qualified
name, and the routing key is what a broker adds to it. Three segments:

```
posts.PostCreated.9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60
└──┬─┘ └────┬────┘ └──────────────────┬──────────────┘
namespace   name                the event's tag
```

The first two are **selection**: a consumer binds to `posts.PostCreated.*` and receives only what it
asked for. The third is **ordering**: the whole key identifies one aggregate, which is what the
outbox's `key` and SNS's message group are built from.

It is the *qualified* name, never the local one: without the namespace in the value, a binding on
`posts.*` does not match — the message goes out, the exchange drops it, and nothing in the log says so.

A transport that addresses differently says so in its **packet** (`toPacket`): Inngest, whose
triggers have no wildcards, is emitted under the qualified name instead — see **Adding a transport**.

### What decides whether an event leaves

| the event | leaves through | runs locally |
|---|---|---|
| `@EventType({ namespace: 'posts' })`, with `destinations.posts` and a transport for it | that destination | yes |
| `@EventType({ namespace: 'posts' })`, with `destinations.posts` and no transport for it | the outbox's `local`, to the `@OnOutboxMessage()` handlers here | yes |
| `@EventType({ namespace: 'tags' })`, and no `destinations.tags` | nowhere | yes |
| no `@EventType` at all | nowhere: it has no namespace | yes |
| any of the above, published by a service with `publishes: false` | nowhere | yes |
| any of the above, ingested from another service | nowhere: the origin mark | yes |

Every event published on this bus also runs locally: what leaves is decided by the namespace and the
destinations, never by the event about this process.

### Who publishes what the outbox holds: the relay mode

`@nestjs/outbox`'s relay claims due rows under a lease, publishes each through its namespace's
`ClientProxyTransport` — or `local`, for a namespace with none — deletes it once a transport took it, reschedules it with backoff when one did
not, and dead-letters it after the last attempt. Where that loop runs is a decision about the
**process**, and it is said twice at the application's root, from one config value: `relay.enabled` to
the `OutboxModule`, and `relay` to the bus, in `outbox.useFactory` — which is what tells it what to do
once a unit of work has committed:

| `relay` | the relay | after a unit of work commits | for |
|---|---|---|---|
| `poll` (default) | polls in this process, every `pollInterval` | wakes it (`notify()`), so a commit does not wait for the next poll | a long-lived process: `pnpm dev`, a container |
| `drain` | never polls | publishes what is due — `runOnce()`, a batch at a time until one comes back short — **before the unit answers** | a function, which is frozen the moment it answers and so can hold no loop |
| `off` | never polls | nothing: another process relays | an API-only instance beside relay workers |

A drain that fails is logged and **not** rethrown: the rows are committed, the command answers, and
publishing them is the relay's to retry — by the next unit that drains, or by a scheduled
`OutboxHousekeeping.sweep()`. That is what a function trades for having no loop, and it is why every
deployment that drains also schedules a sweep.

The bus's own settings (`TransportOutboxSettings`) are that mode and `batchSize` — `100`, the
package's; say it again only when the `OutboxModule`'s is different, because a drain stops at the first
batch that comes back short. Everything else about the relay is `@nestjs/outbox`'s and is set on the
root `OutboxModule`:

| `OutboxModule` option | default | |
|---|---|---|
| `relay.pollInterval` | `1s` | the wait between two polls of an idle relay |
| `relay.batchSize` | `100` | messages claimed per poll, and per round of a drain |
| `relay.lease` | `30s` | how long a claim is exclusive |
| `relay.publishTimeout` | a third of `lease` | a publish that takes longer is a failed attempt |
| `relay.concurrency` | `10` | keys published side by side within a batch |
| `retry` | 20 attempts, 30 to 60 minutes in all | attempts and backoff before a dead letter: size it to how long a broker can be down |

and the housekeeping's on `OutboxHousekeepingModule` (`@nestposts/outbox-mikro-orm`):

| option | default | |
|---|---|---|
| `inboxRetention` | `30d` | how long an inbox remembers a message — longer than any redelivery, a dead letter's requeue included |
| `interval` | `1h` | how often a long-lived process prunes the inbox and reads the outbox's health; `false` in a function |
| `lagWarning` | `1m` | a due message older than this is reported, with the outbox's counts |

The applications read them from the environment in their own `config/outbox.config.ts`:
`POSTS_OUTBOX_RELAY`, `POSTS_OUTBOX_POLL_INTERVAL_MS`, `POSTS_OUTBOX_RETRY_ATTEMPTS`,
`POSTS_INBOX_RETENTION_DAYS`, and the `TAGGING_` twins; the web reads `WEB_OUTBOX_RELAY` (default
`drain`, because OpenNext's server is a function) and `WEB_OUTBOX_RETRY_ATTEMPTS`.

**Every row belongs to the service that wrote it.** One `transport` schema serves every service, and a
relay may only publish what its own service produced — the destinations are the producer's, and
another service has none of them. `MikroOrmOutboxStore` (`MikroOrmOutboxModule.forRoot({ producer })`)
is built with the service's name as its `producer` and reads and writes only its own rows; the inbox is not scoped that way, because its key
already names the consumer.

### Housekeeping, and what a dead letter does

`@nestjs/outbox` leaves three things to the application, and `OutboxHousekeeping`
(`OutboxHousekeepingModule`, `@nestposts/outbox-mikro-orm`) does them — outside this library, because
they are the outbox's and not the bus's:

- **the inbox is pruned** of what every consumer processed longer ago than `inboxRetention`. It is one
  table and one rule, so whichever service prunes, prunes them all — which is what keeps a service with
  no schedule of its own from growing its rows forever;
- **the outbox's health is read** (`relay.stats()`) and reported as a warning when a due message has
  waited longer than `lagWarning` or when there are dead letters. `lagMs` grows while a broker is down
  and `deadLetters` is what needs a person: those are the two numbers to alert on;
- **a message given up on is an error** in the log, naming its topic, its id, the attempts and the
  reason, rather than a warning among the retries.

A `poll` process does the first two on a timer (`interval`), unreferenced so it never keeps a process
alive. A function has no timer that survives it (`interval: false`), so a schedule calls **`sweep()`**:
it publishes what is due, prunes the inbox and answers `{ pruned, stats }`. Here that is `apps/posts-api/src/lambda/relay.ts`
and its tagging twin, invoked every minute on AWS, and `POST /api/outbox/sweep` in `apps/web`.

**A dead letter is also a report.** `DeadLetterReporting` (`@nestposts/observability`, installed by
`ErrorReportingModule`) listens on `@nestjs/outbox`'s diagnostics channel,
`nestjs:outbox:dead-lettered`, and reports each one to GlitchTip **in the trace the message was staged
with** — so the issue opens onto the request whose event could not be published. Retries are not
reported: they are the relay doing its job, and the log has them.

A dead letter keeps its `seq` and its id. `@nestjs/outbox`'s `OutboxDeadLetters` lists, requeues and
purges them over the same store: a requeued message goes back ahead of the later messages of its key,
and consumers' inboxes still recognise it if it had in fact arrived.

---

## Receiving, in detail

### The three guards

Each covers what the others do not:

| guard | where | catches |
|---|---|---|
| the origin mark | on the message, `cqrs-transport-origin` | the event this service produced and got back — which is what keeps "everything published locally leaves" and "everything received is published locally" from feeding each other forever |
| the inbox | `@nestjs/outbox`'s `OutboxInbox`: one `(consumer, message id)` row, in the same transaction as everything the message causes | a redelivery — no broker delivers exactly once — and, from the outbox, a message the relay published twice because a lease ran out under it |
| your aggregate | the command handler, reading its own state | the same decision arriving as a *different* message. It is the only guard that survives an emptied inbox |

The inbox row is `on conflict do nothing` on `(consumer, message_id)`, not a query followed by an
insert: two deliveries racing each other both pass a query, and the conditional insert settles it in
the database — the second waits for the first transaction and then sees its row.

**It is keyed by the consumer too**, which the inbox this replaced was not: two services ingesting the
same event each keep their own memory of it. The row also records what the message was and who sent
it (`message_type`, `origin`, beside the package's columns) when the application points
`inbox.descriptions` at the store (`InboxDescriptions`), which is what lets an operator or a suite read
`MikroOrmOutboxStore.processedBy('tagging')` and tell a service's own echo from what it ingested.

### What the ingestion's transaction covers — everything

One message is one unit of work, and the unit runs in a transaction:

```
EventIngestion.ingest(envelope)
  ingesting(message)                 the CONSUMER span, outside the unit — see below
  └ UnitOfWork.run(…, { failOnTrackedFailure: true, transaction })
     ┌ transaction
     │ OutboxInbox.processInTransaction(em, consumer, id)   the inbox row — or a duplicate, and nothing else
     │   describeInbox                                      what it was, who sent it
     │   EventLog.append                                    with a log
     │   EventBus.publish(event, request)                   the local bus: projections, sagas and the
     │                                                      commands they dispatch JOIN the unit
     │ prepareCommit                                        what those reactions published → the outbox
     └ commit, or rollback of all of it
```

It commits whole or rolls back whole. A reaction that fails — a projection that throws, a saga's
command that throws — fails the unit (`failOnTrackedFailure`), and takes the inbox row, the log append,
its own writes and the outbox rows the other reactions staged with it: the redelivery is new again, and
the transport's retry (and `@RetryPolicy`) has something to act on. A crash half-way leaves nothing
half-remembered. There is nothing to forget after the fact, which is what the inbox this replaced had
to do — and a crash between the failure and the forgetting could skip.

**The event reaches the local bus while the transaction is open**, because that is what makes its
reactions part of it. What reacts **without** being tracked by the unit — a subscription's stream —
sees it before the transaction commits, and must read what the event carries rather than query for
what the reactions wrote.

**A reaction whose effect is outside the database commits it on its own.** Rolling the transaction back
does not unsend an email, so a delivery recorded in the rolled-back transaction would be sent again by
the retry. `NotificationDeliveryRepository.recordAfter(delivery, send)` (`libs/notifications`) is the
shape: send, then record the delivery, in a transaction of their own, outside the ingestion's.

**The transport's tables live in a schema of their own, `transport`** (`TRANSPORT_SCHEMA`,
`@nestposts/database`), created by the system migrations: `outbox_messages`, `outbox_dead_letters` and
`outbox_inbox` (`MikroOrmOutboxModule`'s) and `event_log` (this library's). They
are the transport's bookkeeping, not a tenant's data — one inbox and one outbox for every service, one
log for every event, each log row recording the tenant it was appended in (the schema of the entity
manager the append ran on). Their native statements ask the metadata where the table is, so a service
keeps working whatever tenant its request is in.

### Event sourcing a service that owns no read model

A service that **decides about an aggregate it has no table for** names the aggregate, and **there is
nothing else to write**: every ingested event is appended to the stream of the aggregate its
`@EventType({ tags })` names, inside the ingestion's transaction, and a repository per aggregate replays
it:

```ts
@Module({
  imports: [
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    OutboxModule.forRoot({ /* transports, route, relay — as in step 2 */ }),
    MikroOrmOutboxModule.forRoot({ producer: 'tagging' }),
    TransportEventBusModule.forRoot({
      identity: 'tagging',
      transaction: MikroOrmUnitOfWorkTransaction,
      inbox: { descriptions: MikroOrmOutboxStore },
      outbox: { destinations: PostEventsClient.namespaces },
      eventStore: [Post],
    }),
    PostEventsClientModule,
  ],
})
export class AppModule {}
```

From there a command handler is the ordinary one — load, let the domain decide, commit:

```ts
@CommandHandler(CompletePostWithDefaultTag, { scope: Scope.REQUEST })
export class Handler implements ICommandHandler<CompletePostWithDefaultTag> {
  constructor(
    private readonly posts: EventSourcedRepository<Post>,
    private readonly publisher: EventPublisher,
    @Inject(REQUEST) private readonly request: AsyncContext,
  ) {}

  async execute(command: CompletePostWithDefaultTag): Promise<void> {
    const post = await this.posts.load(command.postId);      // replayed from the stream
    if (!post) throw new PostNotFoundException(command.postId);
    if (post.isComplete()) return;                            // the aggregate is the last guard

    this.publisher.mergeObjectContext(post, this.request).complete([Tag.default()], new Date());
    post.commit();                                            // appended to the stream, and staged for the outbox
  }
}
```

There is no `save`: the bus appends every event it publishes to the log at the unit's prepare phase,
filed under the aggregate its tag names, so committing the aggregate is what writes its decision to
the stream — one write path, which is Axon's `EventSourcingRepository` too.

The saga that dispatches it runs inside the ingestion's unit, so the decision, its append and its
outbox row commit in the transaction that recorded the message that caused them.

The aggregate is the domain's own class, replayed through the `on<Event>` handlers it already has — the
same ones the service that owns the table replays with. Nothing about the stream, the sequence numbers,
the payload format or the rule that a stream is created once belongs to the application: they are the
same every time, so they are here.

**One thing the log refuses**, loudly, in a log line: appending a creation to a stream that already
starts with one. That copy arrives as another message with another identifier, so the inbox cannot
recognise it, and appended at the end a replay would read it as the aggregate starting over — version
back to one, a decision taken again.

### Telling an ingested event from a local one

```ts
import { isIngested, originOf } from '@nestposts/transport-eventbus';

if (isIngested(event)) {
  // it came from originOf(event) — do not decide again, project it
}
```

That is how a projection knows to materialise a decision, and how a saga knows not to take one twice.

---

## The request, across services

`AsyncContext` is process-local: it holds a `ContextId` the injector understands and nothing outside
does. What travels is **what it stands for**, in the message's headers.

```ts
export class PostRequest extends AsyncContext implements ContextAttributes {
  constructor(readonly postId: PostId) { super(); }

  toAttributes(): Record<string, string> {
    return { 'post-request-post-id': this.postId.value };
  }
}

@Injectable()
export class PostRequestContextCodec extends CorrelatedRequestContext {
  protected override contextFor(message: Ingestion): AsyncContext | undefined {
    const postId = message.metadata['post-request-post-id'];
    return postId ? new PostRequest(PostId.parse(postId)) : undefined;
  }
}
```

**Override `contextFor`, not `decode`.** `decode` is where the arriving correlation id is written onto
whatever comes back, so a subclass that replaced it would start a **new trace at every hop** —
everything still works, the chain of "this happened because of that one mutation" just ends at the
broker, which is exactly the kind of thing nobody notices.

Publish with the request, and on the other side `PostRequest.of(event)` answers exactly as it does
here — which is what makes a choreographed saga one request instead of several. The default codec
(`CorrelatedRequestContext`) carries a **correlation id**, the same for every message of one request
however many services it crosses, and a **causation id**, the identifier of the message that caused
this one.

The codec runs when the event is **staged**, not when the relay publishes it: by then there is no
request to encode, which is why the headers are the outbox row's and not the relay's.

### Who sees the request on the far side

| | sees it as | when |
|---|---|---|
| a **guard**, an interceptor, a filter | `IncomingRequest.of(context)` | before the handler — which is the point: a shared guard reads the tenant or the session off a message the way it reads them off an HTTP request |
| the **controller**, dispatching itself | `IncomingRequest.from(envelope)` | with the envelope in hand |
| an `@EventsHandler`, a `@Saga` | `MyRequest.of(event)` | the ingestion publishes the event under the restored context |
| a **`Scope.REQUEST` command handler** | `@Inject(REQUEST)` | the saga passes the context on (`AsyncContext.merge(event, command)`), and the handler resolves in it |

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
reachable from the `ExecutionContext`. What the publishing
service put in its context (a tenant, a user, a locale, a feature flag) is in the envelope's headers,
so authorisation on a message is the same code as authorisation on a request.

### The trace travels with it

`traceparent` goes in the message's headers, written when the event is staged — the trace the event was
**published** in (`EventTrace`), or the active one for an event nobody stamped — and read where the
message is ingested, so the far side's work is a **child** of the request that caused it, and a
choreographed saga is one trace rather than two that share a correlation id. The ingestion opens one
`CONSUMER` span around the whole of itself, the unit of work included — **outside** the unit, because
what the reactions stage is recorded at the unit's prepare phase, and the `traceparent` those rows carry
is the one active then.

There is no span for the relay's publish, and none is needed: the link between the two sides is the
`traceparent` captured at staging, so the consumer's span hangs off the work that raised the event and
not off whichever poll happened to publish it.

It is `@opentelemetry/api` and nothing else, which is a no-op until an application starts an SDK
(`@nestposts/observability`). Nothing behaves differently when none is running.

Like the correlation ids, the trace keys are **excluded** from what
`TransportRequestContext.toAttributes()` hands back: re-emitting the previous hop's `traceparent`
would make everything this service publishes a sibling of the message it received instead of a child
of what it is doing now. The trace stays one trace, which is what makes it hard to notice.

`src/inbound/request-propagation.spec.ts` is that chain as a test: the guard sees the tenant, the saga
reads the application's own context back, the request-scoped command handler resolves under the same
correlation id, and a delivery whose tenant is refused never reaches the ingestion.

---

## Testing without a broker

**One service on its own needs no transport at all.** With no broker its outbox routes `local`, and
what it publishes reaches its own `EventBus` through `LocalDelivery` — so a spec asserts on the bus,
or, for the message itself, declares an `@OnOutboxMessage()` of its own beside `LocalDelivery`, which
is what `apps/tagging/test/tagging.spec.ts` does for the decision it publishes:

```ts
@Injectable()
class Published {
  readonly messages: OutboxMessage[] = [];

  @OnOutboxMessage(['posts.PostCreated'], { consumer: 'tagging-spec', inbox: false })
  record(_payload: unknown, { message }: OutboxHandlerContext) {
    this.messages.push(message);                          // the topic, the key, the headers, the payload
  }
}

Test.createTestingModule({ imports: [AppModule], providers: [Published] });
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

`publishedEnvelope(event, { producer, request })` is that envelope **as another service's outbox would
have published it**, built by the same `EventMessages` production stages with, so the headers, the
routing key and the payload encoding are the real ones:

```ts
const { pattern, envelope } = publishedEnvelope(new PostPreCreatedEvent(id, 'Nest', new Date()), {
  producer: 'posts-api',
  codec: new PostRequestContextCodec(),
  request: new PostRequest(id, 'acme'),
});
await consuming.server.emit(pattern, envelope);
```

**Two services in one suite** are two of those, and the broker between them is the publishing one's
`local`: an `@OnOutboxMessage()` the spec declares there takes what its outbox delivers and emits it
on the other's server, under its routing key. An outbox is a table, so each service also gets a
database — a schema of its own, from `testDatabaseConfig` in `@nestposts/database/testing`, with
`outboxEntities` among its entities — and the root a spec declares is the one an application running
with no broker does:

```ts
const noBroker = OutboxRoute.over({});

@Injectable()
class ToConsuming {
  @OnOutboxMessage('posts.PostPreCreated', { consumer: 'wire', inbox: false })
  async carry(_payload: unknown, { message }: OutboxHandlerContext) {
    await consuming.server.emit(EventAddress.ofMessage(message).routingKey, message);
  }
}

OutboxModule.forRoot({ route: noBroker, relay: { enabled: false } }),
MikroOrmOutboxModule.forRoot({ producer: 'publishing-service' }),
TransportEventBusModule.forRoot({
  identity: 'publishing-service',
  transaction: MikroOrmUnitOfWorkTransaction,
  outbox: { destinations: [POSTS_NAMESPACE], useFactory: () => ({ relay: 'drain', route: noBroker }) },
}),
```

`startInProcessService` starts a service the way production starts it. It exists because
`createTestingMicroservice` starts it with `init()`, and in Nest 12 `NestMicroservice.init()` runs the
bootstrap hooks **twice** — which binds every `@EventsHandler` twice, and delivers every event twice
to a suite that is there to prove one delivery is one thing. It creates the service's schema from its
entities and drops it on close (`createSchema: false` for a spec whose tables the real migrations
made), and it also takes an already compiled testing module, which is how a spec replaces a
destination's client with one that records what it was asked to send:

```ts
const tagging = await startInProcessService(
  await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PostEventsClient)
    .useValue(new RecordingClient())
    .compile(),
);

tagging.app.get<RecordingClient>(PostEventsClient).sent;   // [{ pattern, data }]: the envelope, or its record
```

`RecordingClient` keeps what it was asked to send instead of sending it: the pattern it went out under
and what `toPacket` handed the client — the `OutboxEnvelope`, or the transport record around it
(`OutboxPackets.inProcess`, for a client with no record of its own, is the envelope under its routing
key).

The doubles — `startInProcessService`, `RecordingClient`, `publishedEnvelope` — are behind
`@nestposts/transport-eventbus/testing` and not in the main barrel, because `startInProcessService`
reaches Testcontainers and every production bundle would carry it. There is no client for the memory
transport: nothing publishes to a server in its own process except a suite.

`src/in-memory/transport-loop.spec.ts` is the worked example: two services with no broker, each
carrying its `local` to the other, the real class arriving, the request restored, a redelivery reaching
nobody, each inbox keeping what its own service consumed, and the loop cut by the origin mark. `src/outbox/event-outbox.spec.ts`
is the outbound half on its own: the event committed with the writes that raised it, discarded with a
command that failed, kept while the broker is down and published once it is back, in each relay mode.
`src/outbox/local-delivery.spec.ts` is the half with no broker: a namespace with no transport relayed
to `local` and told to the bus there and not at the commit, as this service's own decision, once
however often the relay delivers it, retried when a handler fails.
`MikroOrmOutboxStore` passes `@nestjs/outbox/testing`'s own contract suites
(`outboxStoreContract`, `outboxInboxStoreContract`) with their concurrency cases on, in
`libs/core/outbox-mikro-orm`.

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
             cqrs-transport-correlation-id 7b2c…                       ← the request, across services
             cqrs-transport-causation-id   51e0…
             x-tenant                      acme
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
`headers`. The headers go out **twice** on RabbitMQ — inside the envelope, which is what the consumer
reads on every transport alike, and as AMQP headers, where a broker, a management UI, a shovel or a
dead-letter queue expects to find routing facts without anybody decoding a body.

The one thing the payload still encodes is a `Date`: `{"@date":"…"}` goes out and a `Date` comes back,
because JSON has no date type and JavaScript has no field types at runtime to guess one.

To a client in this process (`OutboxPackets.inProcess`, a suite's `RecordingClient`) the data is the
envelope itself. On SNS the routing facts are lifted
into message attributes, and on Inngest the envelope is the event's `data`: see the next two sections.

---

## On AWS: SNS is the exchange, SQS is the queue

The transport itself — `SnsClientProxy`, `SqsClientProxy`, `SqsStrategy`, `SqsContext`,
`processSqsEvent`, the record builders — is **`@nestposts/microservices-aws`**, a package that knows
nothing about envelopes, CQRS or this library, the way `@nestjs/microservices` does not. What stays
here is what needs `@EventType`: the packet (`OutboxPackets.aws`) and the binding (`SnsFilterPolicy`).
Inngest is split the same way, into **`@nestposts/microservices-inngest`**, with `OutboxPackets.inngest`
and `inngestTriggers` (the `@EventType` registry as the strategy's `triggers`) staying here.

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

On a **FIFO** topic `MessageGroupId` is the aggregate (the last segment of the routing key), so one
post's events are ordered against each other while different posts proceed in parallel, and
`MessageDeduplicationId` is the envelope's id — so a relay that publishes the same message twice, a
retry after a timeout or a lease that ran out, is deduplicated by AWS before the far side's inbox has
to. That is why content-based deduplication stays off.

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
appends to an aggregate's stream wants one queue and not several — `infra/aws/messaging/queues.ts`
has that failure measured.

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

FIFO                MessageGroupId          9f1d…               ← the aggregate
                    MessageDeduplicationId  0f0d2a5e-…          ← the envelope's id

body                {"pattern":"posts.PostCreated.9f1d…",
                     "data":{"id":"0f0d2a5e-…","topic":"posts.PostCreated","key":"posts/9f1d…",
                             "headers":{"cqrs-transport-message-type":"posts.PostCreated#2.0.0",
                                        "cqrs-transport-origin":"tagging",
                                        "cqrs-transport-correlation-id":"7b2c…",
                                        "x-tenant":"acme","traceparent":"00-4bf9…-01", …},
                             "createdAt":1788868800000,
                             "payload":{"postId":"9f1d…","title":"Nest","version":2,
                                        "occurredAt":{"@date":"2026-09-08T12:00:00.000Z"}}}}
```

The headers are in the body rather than in the attributes because ten is not enough: four transport
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
| the event's `name` | the **qualified** name, `posts.PostCreated` — not the routing key: Inngest matches a trigger by exact name and has no wildcards, so a name carrying the aggregate would mint one event name per post |
| the event's `data` | the envelope, exactly as every other transport carries it |
| the event's `id` | `<name>:<envelope id>`: a relay that publishes the same message twice sends one event as far as Inngest is concerned |
| `meta.sessions.correlation_id` | the request's correlation id — Inngest's own grouping, which it propagates to every event a run sends |

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

The answer is not a second port. It is that **the bus itself is event sourced**, so a handler writes
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

One option turns it on, and it binds the `EventBus` token to `EventSourcedEventBus`:

```ts
TransportEventBusModule.forRoot({ /* … */ subscriptions: true }),
```

**Every tenant's events are in the one log**, and each is handed out stamped with the tenant its row
records (`Tenant.of(event)`, from `@nestposts/database`) — which is what lets a subscription hear only
its own tenant, where the event carries no request of its own.

**And each carries the trace it was appended in.** `TransportEventBusService` stamps what it
publishes with the active trace (`EventTrace.stamp`), the log stores it beside the event
(`trace_context`, or the trace the append ran in for an event nobody stamped), and the bus stamps it
back on what it reads. `EventTrace.of(event)` is then a context a span can start in — which is what
lets a subscriber's delivery be part of the trace of the request that caused the event, in another
container, seconds later. `EventTrace.carry(event, view)` passes it on to what the event becomes.

The log is appended in the unit of work's prepare phase, inside its transaction, so a subscriber in
another container reads an event only once the work that raised it has committed.

### The three readers of a bus are not the same reader

This is what makes it safe, and it is the whole design:

| who | reads | gets |
|---|---|---|
| `@EventsHandler` | `subject$`, directly, inside `bind()` | **this process** |
| a saga | the observable, **at registration** | **this process** |
| anything that pipes the bus — a `@SubscriptionHandler` | the observable | **the log** |

A projection must run once per event: delivered to every container's bus it would be written as many
times as there are containers. A saga must dispatch once, for the same reason — so
`registerSagas` swaps the source to `subject$` while Nest registers them, which works because
`registerSaga` subscribes as it registers. A subscription is the opposite: the container holding the
stream open is usually not the one that did the work.

`src/subscriptions/event-sourced-event-bus.spec.ts` asserts all three, so a Nest upgrade that moves a
saga's subscription out of registration fails a test rather than duplicating commands in production.

### A new subscriber starts at the head

The cursor is in memory and dies with the process. A subscriber gets what happens from the moment it
subscribed, which is what a subscription means, and one that went away is not owed what it missed.

### One thing to know before pointing a suite at it

`apps/posts-api`'s e2e asserts the **`EventBus` subscriber count** — that opening a subscription adds
one observer, that two subscribers of one topic share a single one, that unsubscribing removes it on
the spot. Those assertions are about `subject$`, and with the log-backed bus they are false by
construction: the subscription reads the log. The suite runs in the default mode, which is the mode
it describes; running it with `POSTS_SUBSCRIPTION_SOURCE=feed` fails six tests for that reason and
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
aggregate — RabbitMQ, SNS — is sent `EventAddress.ofMessage(message).routingKey` instead, which is the
only place that has a reason to know. `OutboxPackets` holds the three brokers this repository uses, and
`OutboxPackets.for(kind)` is how a destination picks one.

On the way in, whatever the transport's server hands `@Payload()` has to be the envelope — its default
deserializer, usually, since the envelope is plain JSON. If it is not, `EventIngestion` refuses the
message by name instead of ingesting nothing.

Nothing else changes — not the outbox, not the relay, not the envelope, not the ingestion.

---

## What is gone, and what took its place

For whoever knew this library before `@nestjs/outbox`; `NOTICE.md` has the reasons.

| before | now |
|---|---|
| `@Publisher(namespace)`, `EVERY_NAMESPACE`, `ITransportPublisherEventBus` | the root `OutboxModule`'s `transports`: namespace → `ClientProxyTransport(Client, { toPacket })`, and `outbox.destinations` naming the same namespaces |
| `OutboxRouting` and its log line | `OutboxRoute.over(transports)`, the outbox's `route`, reading the namespace off the message |
| `MemoryClient`, as an application's destination (`POSTS_TRANSPORT=memory`) and as a suite's publisher | no transport: the outbox's own `local`, received by `LocalDelivery` and told to the bus; a suite delivers on `TopicMemoryServer.emit` |
| `EventForwarder` (a direct emit) | nothing: `EventOutbox` writes, the relay sends |
| `EventEnvelope` / `EventEnvelopeFactory` | `@nestjs/outbox`'s `OutboxEnvelope`, built from `EventMessages` |
| every `*EventEnvelopeSerializer` / `*EventEnvelopeDeserializer` | `OutboxPackets` on the way out; the transports' default deserializers on the way in |
| `@TransportEvent()` / `TransportEventPipe` | `@Payload() envelope: OutboxEnvelope`, and `EventIngestion.ingest(envelope)` |
| `MessageInbox` / `MikroOrmMessageInbox` / `NoMessageInbox`, `transport.transport_message_inbox` | `@nestjs/outbox`'s `OutboxInbox` over `MikroOrmOutboxStore`, `transport.outbox_inbox` |
| forgetting the inbox row after a failed reaction | one transaction for the whole ingestion |
| `cqrs-transport-identifier` | the envelope's `id` |
| upstream's `{ eventName, payload }` wire shape | nothing reads it |

---

## Reference

### What the application declares

The options of `forRoot` are the table in **Start it**, above; under them are the bindings the library
asks for — `TransportIdentity` (required), `RequestContextCodec` (defaulted), `UnitOfWorkTransaction`
(`transaction`), `InboxDescriptions` (`inbox.descriptions`) — and what it expects the application to
have declared at its root: `@nestjs/cqrs` (`CqsrsModule.forRoot`), and, for a service with an inbox or
an outbox, `@nestjs/outbox`'s `OutboxModule` with a store registered with it (`MikroOrmOutboxModule`).
It binds `UnitOfWorkCommands` always, `EventIngestion` with an inbox, and `EventMessages`,
`EventOutbox` and `LocalDelivery` with an outbox.

It exports the bus itself (`TransportEventBusService`, and `TRANSPORT_EVENT_BUS_PUBLISHER` bound to
it), `IncomingRequest` and `RequestContextCodec`, and whatever of the above the options turned on.

### The pieces you will name

| | |
|---|---|
| `@EventType` (in `@nestposts/platform`) | the event's identity on the wire, and its namespace is its route |
| `TransportEventBusModule.forRoot` / `.forRootAsync` | the transport, started in one call |
| `ClientProxyTransport(Client, { toPacket })` (`@nestjs/outbox`) | a destination: the client, and how a message becomes its packet |
| `OutboxPackets.for('rabbitmq' \| 'aws' \| 'inngest')` | the packet of each broker: an `RmqRecord`, an `SnsRecord`, an `InngestRecord`; `OutboxPackets.inProcess` is the envelope, for a suite's client |
| `OutboxRoute.over(transports)` | the outbox's route: the namespace of the message, or `local` when the outbox has no transport for it |
| `LocalDelivery` | the `@OnOutboxMessage()` handler that receives what goes `local` and tells it to the `EventBus` |
| `EventMessages` | what an event becomes: one outbox message, with its headers |
| `EventOutbox` | where the events a unit staged are written, and what happens after its commit |
| `TransportOutboxSettings` / `OutboxRelayMode` | the relay's place in the process — `poll`, `drain`, `off` — as the bus acts on it after a commit |
| `UnitOfWork` / `UnitOfWorkTransaction` / `UnitOfWorkCommands` | the unit every command and every ingested message runs in, the port of the transaction it runs in, and what puts every command in one |
| `InboxDescriptions` | where an admitted message's type and origin are noted beside its inbox row — optional |
| `MikroOrmOutboxModule` / `MikroOrmOutboxStore` / `outboxEntities` (`@nestposts/outbox-mikro-orm`) | `@nestjs/outbox`'s two storage contracts on MikroORM, scoped by producer, and their three tables |
| `MikroOrmUnitOfWorkTransaction` (`@nestposts/outbox-mikro-orm`) | the unit of work's transaction on MikroORM, and its `detached` variant |
| `OutboxHousekeepingModule` / `OutboxHousekeeping` (`@nestposts/outbox-mikro-orm`) | pruning the inbox, the outbox's health, and `sweep()` for a schedule |
| `OutboxEnvelope` (`@nestjs/outbox`) | what crosses: `id`, `topic`, `key`, `headers`, `createdAt`, `payload` |
| `EventIngestion.ingest(envelope)` | what a controller calls |
| `envelopeOf` / `messageOf` / `reconstruct` | the envelope checked, read, and rebuilt as the real event |
| `IncomingRequest` | the request a message belongs to — `from(envelope)` in a controller, `of(context)` in a guard, an interceptor or a filter, `traceOf` for the trace |
| `EventAddress.everyEventOf(namespace)` / `.everyEventOf(EventClass)` | the binding: `posts.#`, or `posts.PostCreated.*` |
| `EventAddress` | what an event says about itself — its message type, its tags and its `routingKey`; `ofMessage` reads the same back off an outbox message |
| `SnsClientProxy` / `SqsClientProxy` (`@nestposts/microservices-aws`) | a topic for a fact, a queue for a message addressed to one service |
| `SqsStrategy` / `processSqsEvent` (`@nestposts/microservices-aws`) | the consumer: a polling loop, or a Lambda invocation |
| `SnsFilterPolicy.everyEventOf(...)` / `.exceptFrom(...)` | the binding, for a subscription |
| `inngestTriggers` | a binding, as the event names an Inngest function can trigger on |
| `injectTraceContext` / `isTraceContext` / `EventTrace` | the trace on the message, what must not be re-emitted, and the trace an event was published in |
| `EventLog` / `MikroOrmEventLog` / `eventLogEntities` | the one log: an aggregate's history and the service's order, two reads of one table |
| `EventSourcedRepository.of(Aggregate)` | the replay; `commit()` is what appends |
| `EventSourcedEventBus` | the `EventBus` whose observable side is that log |
| `isIngested` / `originOf` / `identifierOf` | what an event says about where it came from |
| `DatabaseModule.forRoot` / `.forFeature` (in `@nestposts/database`) | the connection, and the tables each module owns |
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
| `<APP>_INBOX_RETENTION_DAYS` | `POSTS_`, `TAGGING_`; default 30 |
| `WEB_OUTBOX_SWEEP_SECRET` | the bearer `POST /api/outbox/sweep` answers to; unset, the route answers 404 |

`AWS_ENDPOINT_URL` points the SNS and SQS clients at LocalStack and is what makes the AWS transport
usable without an account; `AWS_REGION` and the credentials are the SDK's own, except that a local
endpoint with no key in the environment gets LocalStack's documented pair rather than a
`CredentialsProviderError`. Each application reads it in its own `config/aws.config.ts` and hands the
clients a `clientConfig`.
