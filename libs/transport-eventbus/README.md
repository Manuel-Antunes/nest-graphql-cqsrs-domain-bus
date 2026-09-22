# @nestposts/transport-eventbus

**The CQRS event bus, speaking through Nest's microservice transports.**

A domain event raised inside a command handler reaches the handlers, sagas and subscriptions of this
process — and, if it is addressable, the other services as well. Nothing in the domain or in the
handlers has to know: the integration point is `IEventBus` itself.

This library is a vendored and adapted copy of
[nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus) by Sergey
Telpuk (MIT), plus an integration layer. [`NOTICE.md`](./NOTICE.md) is the account of what came from
upstream, what the new versions forced, and what was added here; this file is how to use it.

| | |
|---|---|
| publishing | `TransportEventBusService` (an `IEventBus`) → `EventForwarder` → `OutboxRouting` → a `ClientProxy`, serialising with the transport's `EventEnvelopeSerializer` |
| receiving | the transport's `EventEnvelopeDeserializer` → `@TransportEvent()` (a pipe) → your `@EventPattern` controller → `EventIngestion` → `MessageInbox` + `IngestionSink` → the local `EventBus` |
| what crosses | `EventEnvelope`: **`data`**, the event as the application wrote it, and **`metadata`**, a flat map that becomes the transport's headers |
| what keeps it once | the origin mark, the inbox, and your aggregate |

Two decorators and four bindings. There is **no module function**: the mechanism is a list of
providers you declare in your own module, and what the library needs from your application it asks
for as an abstract class.

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

The **namespace is also the selection**: a destination declares the namespaces it takes, and that is
the whole routing (step 3). An event whose namespace no destination takes stays in this process, which
is the right default for the events a domain is mostly made of — and so does an event with no
`@EventType`, which has no namespace at all.

`tags` names the properties that identify **which aggregate** the event is about. It is the last
segment of the routing key, so a consumer can bind to one post's stream, and it is what the other side
uses to know what the event belongs to. One tag per event: an event about two aggregates cannot be
ordered by either.

### 2. Start it

```ts
import { Module } from '@nestjs/common';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule } from '@nestposts/database';
import {
  MikroOrmMessageInbox,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
} from '@nestposts/transport-eventbus';

@Module({
  imports: [
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(mikroOrmConfig()),
    TransportEventBusModule.forRoot({
      identity: taggingIdentity(),                    // 'tagging', or an identity of its own
      inbox: MikroOrmMessageInbox,                    // receiving on, and what it remembers
      eventStore: [Post],                             // the aggregates it sources from its streams
      publishers: [
        PostEventsPublisher,
        { provide: POST_EVENTS_CLIENT, useFactory: postEventsClient },
      ],
    }),
  ],
})
export class AppModule {}
```

| option | | |
|---|---|---|
| `identity` | required | who this service is on the wire: a name, or a `TransportIdentity` (`.silent('my-suite')` for a spec) |
| `publishes` | `true` | the master switch of the outbound half, when the identity is a plain name |
| `requestContext` | `CorrelatedRequestContext` | what a request means here |
| `publishers` | `[]` | the destinations: the `@Publisher` classes and the clients they hold |
| `inbox` | — | passing one turns **receiving** on: `MikroOrmMessageInbox`, or `NoMessageInbox` for a service that keeps no memory of what it received |
| `sink` | `NoDurableState` | what an ingested event leaves durable, inside the ingestion's transaction |
| `eventStore` | — | the aggregates this service event-sources; given, the store and the sink that fills it are wired, with a repository per aggregate |
| `imports` / `providers` / `exports` | `[]` | whatever the above depend on |

`forRootAsync` is the same with the identity resolved at runtime — from a `ConfigService`, a secret, a
discovery agent:

```ts
TransportEventBusModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({ identity: config.serviceName, publishes: config.publishes }),
  inbox: MikroOrmMessageInbox,
  publishers: [PostEventsPublisher, { provide: POST_EVENTS_CLIENT, useFactory: postEventsClient }],
})
```

Only the identity is async, and that is not a limitation: everything else is a class or a provider, and
a provider resolves its own dependencies — a client factory injecting a `ConfigService` is an ordinary
`useFactory`. What cannot wait is module metadata, which Nest reads before anything is instantiated.

Five things to know:

- **`applicationName` is the mark of authorship, not an address.** Where a message goes is the
  `@Publisher`'s client; the name is what every message carries *from* this service, and the inbound
  half's answer to "did I send this?" — a service that binds a namespace it also publishes to receives
  its own events, and without the mark it ingests them, writing its own state again and deciding twice.
  Two services must not share it, and there is no default because a wrong name is worse than a missing
  one.
- **The tables come with the options.** `inbox` brings the inbox's schema and `eventStore` brings the
  streams', through `DatabaseModule.forFeature` (`@nestposts/platform`) — so a table this library owns
  is never something an application copies into its configuration. A service that only publishes needs
  no database at all.
- **Nothing imports `CqrsModule`**: the `EventBus` comes from wherever your application put CQRS.
  `CqrsModule.forRoot()` and `CqsrsModule.forRoot()` are global, so that is enough — and importing the
  static `CqrsModule` inside a provider's module would give it a *second* `EventBus`, which fails
  silently (see `NOTICE.md`).
- **The module is global**, because what it provides is injected from everywhere: a command handler asks
  for `TRANSPORT_EVENT_BUS_PUBLISHER`, a controller for `EventIngestion`, a guard for
  `IncomingRequest`.
- **The provider arrays are still there.** `transportEventBusProviders`, `eventIngestionProviders` and
  `eventStoreProviders` are what `forRoot` composes, and a service that wants to compose them by hand —
  or a spec that wants half of them — still can. `forRoot` is the opinionated way, not the only one.

### 3. Declare where the events go out

A destination is a provider holding a client, declaring which namespaces leave through it:

```ts
import { Publisher, type ITransportPublisherEventBus } from '@nestposts/transport-eventbus';

@Injectable()
@Publisher(POSTS_NAMESPACE)
export class PostEventsPublisher implements ITransportPublisherEventBus {
  constructor(@Inject(POST_EVENTS_CLIENT) readonly client: ClientProxy) {}
}
```

`@Publisher(['posts', 'tags'])` takes both; `@Publisher(EVERY_NAMESPACE)` takes everything, which is
upstream's mode.

and the client itself is ordinary Nest — with one addition, the transport's serializer:

```ts
export const postEventsClient = (): ClientProxy =>
  ClientProxyFactory.create({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
      exchange: 'nestposts.events',
      exchangeType: 'topic',
      wildcards: true,      // this is what makes the pattern BE the routing key
      persistent: true,
      serializer: new RmqEventEnvelopeSerializer(),   // the event in the body, the metadata in headers
    },
  });
```

**The code says what goes out; the configuration says where.** The destination names the namespaces and
the factory says which broker that is, so what a service publishes is its contract rather than an
environment variable — and a new event in a namespace already taken goes out routed, with nothing added
anywhere.

A service may declare several destinations, on different protocols. Two of them may take the same
namespace — a broker and an audit bus — and then the event goes out through both; the routing table
writes that into its log, because it is also how one publishes the same fact twice by accident.

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
    post.commit();                  // local handlers AND the destinations
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
constructor(@Inject(TRANSPORT_EVENT_BUS_SERVICE) private readonly eventBus: IEventBus) {}

await this.eventBus.publish(event);                 // resolves when the transport has taken it
await this.eventBus.publish(event, this.request);   // with the request attached
```

### 5. Receive on the other side

A microservice — on its own (`NestFactory.createMicroservice`) or alongside HTTP — with the
deserializer as the other half of the wire format:

```ts
const app = await NestFactory.create(AppModule);
app.connectMicroservice<MicroserviceOptions>(
  {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL!],
      queue: 'nestposts.posts-api.post-completed',   // one queue per SERVICE
      queueOptions: { durable: true },
      exchange: 'nestposts.events',
      exchangeType: 'topic',
      wildcards: true,
      noAck: false,
      deserializer: new RmqEventEnvelopeDeserializer(),
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
  posts(@TransportEvent() event: DomainEvent): Promise<void> {
    return this.ingestion.ingest(event);
  }
}

@Controller()
export class PostCompletionController {
  constructor(private readonly ingestion: EventIngestion) {}

  @EventPattern(EventAddress.everyEventOf(PostCreatedEvent))   // posts.PostCreated.*  — one type, any aggregate
  postCompleted(@TransportEvent() event: PostCreatedEvent): Promise<void> {
    return this.ingestion.ingest(event);
  }
}
```

**One entry can serve a whole namespace**, and often should: the envelope's message type is what
resolves the concrete class, so one method receives every event of `posts` as the class it is. A
service that keeps another's stream wants exactly that — a binding per event type is a list that has
to grow every time the other service adds one, silently, because an event nobody bound to is dropped
by the exchange without a word. The cost is that the queue also receives what this service does not
act on, including its own events, which the origin mark drops before the inbox.

**`@TransportEvent()` is a pipe**, and the parameter is the domain event: an instance of the real
class, with its dates, marked with where it came from. The transport's deserializer read the two
halves of the envelope — the body and the headers — and the pipe rebuilt the event from them, so
nothing in the controller parses anything and the method body is free to be the reaction. Extra pipes
compose with it: `@TransportEvent(new ValidationPipe())`.

`EventIngestion` refuses an event that did not come through it — without the mark there is no
identifier, and without an identifier the inbox cannot tell a redelivery from a new fact.

**`@TransportRequest()` is the other half**: the `AsyncContext` the message belongs to, rebuilt from
the envelope's metadata by the application's `RequestContextCodec`. A controller that dispatches
instead of ingesting passes it on, and the command runs in the request that opened it on the other
side of the wire:

```ts
@EventPattern<string>(EventAddress.everyEventOf(POSTS_NAMESPACE))   // <string>: see below
posts(@TransportEvent() event: DomainEvent, @TransportRequest() request?: AsyncContext): Promise<void> {
  return this.commandBus.execute(new CompletePost(event), request);
}
```

> `@EventPattern` has an overload that types the handler from the pattern and constrains every
> parameter after the first to `unknown`, so a method that takes the request as well needs
> `@EventPattern<string>(...)`. Without it the compiler says `TS1241: Unable to resolve signature of
> method decorator`, which points nowhere near the cause.

A controller that hands the event to `EventIngestion` does not need it: the ingestion decodes the same
context and publishes the event **with** it, so the handlers, the sagas and the commands those sagas
dispatch are already in that request.

The ingested event is published on the **local** `EventBus`, so `@EventsHandler`, `@Saga` and the
GraphQL subscriptions see it exactly as if a local command had raised it.

**One queue per service is not a preference.** On RabbitMQ a copy is made per bound queue, not per
consumer: two applications sharing a queue compete for the messages, and whichever discards one
acknowledges it — killing it for the other.

---

## Publishing, in detail

### Which routing key an event goes out under

`EventAddress.routingKey`, read off the event and nothing else. Three segments:

```
posts.PostCreated.9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60
└──┬─┘ └────┬────┘ └──────────────────┬──────────────┘
namespace   name                the event's tag
```

The first two are **selection**: a consumer binds to `posts.PostCreated.*` and receives only what it
asked for. The third is **ordering**: the whole key identifies one aggregate, which is what a
consistent-hash exchange in front would distribute by.

It is the *qualified* name, never the local one: without the namespace in the value, a binding on
`posts.*` does not match — the message goes out, the exchange drops it, and nothing in the log says so.

An event with no `@EventType` goes out under `TRANSPORT_EVENT_BUS_PATTERN`, which is upstream's mode
and the only identity such an event has.

**A transport that addresses differently says so in its serializer**, which receives the packet and
returns what the transporter sends — a Kafka topic, a NATS subject, or everything under one pattern:

```ts
export class SinglePatternSerializer extends RmqEventEnvelopeSerializer {
  protected override serializeEnvelope(envelope: EventEnvelope<Record<string, unknown>>, packet: ReadPacket) {
    return super.serializeEnvelope(envelope, { ...packet, pattern: TRANSPORT_EVENT_BUS_PATTERN });
  }
}
```

There is no addressing abstraction beside it, and there used to be: with the wire format in the
serializer and the destination in the `@Publisher`, a per-transport class whose only job was to return
a string had nothing left that the event itself could not answer.

### What decides whether an event leaves

| the event | leaves through | runs locally |
|---|---|---|
| `@EventType({ namespace: 'posts' })`, with a `@Publisher('posts')` | that destination | yes |
| the same, with two destinations taking `posts` | both | yes |
| `@EventType({ namespace: 'tags' })`, and nothing takes `tags` | nowhere | yes |
| no `@EventType` at all | only an `EVERY_NAMESPACE` destination | yes |
| any of the above + `@ExcludeDef()` | unchanged | **no** |

`@ExcludeDef()` is the integration event: a fact this service states for others, which nothing here
reacts to. It is the one thing an event still says about publishing, and it says it about **this**
process, not about a destination.

### What the routing table refuses to do quietly

Both bring the table down on the first publish, naming the class:

| refusal | what it would have cost |
|---|---|
| a `@Publisher` with no namespace | a client wired to a broker with nothing to publish: an oversight, not a configuration |
| a `@Publisher` whose `client` is not a `ClientProxy` | injection would pass and the first event would fail, far from the cause |

Two destinations taking one namespace is **not** refused — that is fan-out, and it is a thing worth
being able to say — but it is written to the log, because it is also how a duplicate happens.

`OutboxRouting.describe()` prints the table it resolved — `PostEventsPublisher ← [posts]` — and it is
logged once, on the first publish.

The table is resolved on the first publish and not at startup, because a client is a provider and a
provider resolved while this one is being constructed is a provider resolved too early.

---

## Receiving, in detail

### The three guards

Each covers what the others do not:

| guard | where | catches |
|---|---|---|
| the origin mark | on the message | the event this service produced and got back — which is what keeps "everything published is forwarded" and "everything received is published" from feeding each other forever |
| the inbox | `MessageInbox`, in the same transaction as the work | a redelivery. No broker delivers exactly once |
| your aggregate | the command handler, reading its own state | the same decision arriving as a *different* message. It is the only guard that survives an emptied inbox |

### The sink: what has to be durable before anything reacts

Two answers ship with the library, and a service picks one:

| option | for |
|---|---|
| nothing (the default is `NoDurableState`) | a service whose state is a read model fed by its own projections: there is nothing to make durable, the projections are handlers like any other |
| `eventStore: [Aggregate]` | a service that **decides about an aggregate it has no table for**: what arrives is appended to that aggregate's stream, and the next decision is taken against the whole history |

Whatever the sink writes lands in the same transaction as the inbox row. The event reaches the local
bus **after** that transaction commits — a handler triggered from inside it would inherit the
transaction through the async store and then find it gone (`Transaction is already committed`).

### Event sourcing a service that owns no read model

This is the second case above, and **there is nothing to write for it** — one option names the
aggregates, and the store, the sink that appends every ingested event to the stream of the aggregate its
`@EventType({ tags })` names, and a repository per aggregate are wired:

```ts
@Module({
  imports: [
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(mikroOrmConfig()),
    TransportEventBusModule.forRoot({
      identity: taggingIdentity(),
      inbox: MikroOrmMessageInbox,
      eventStore: [Post],
      publishers: [PostEventsPublisher, { provide: POST_EVENTS_CLIENT, useFactory: postEventsClient }],
    }),
  ],
})
export class AppModule {}
```

From there a command handler is the ordinary one — load, let the domain decide, save, commit:

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
    await this.posts.save(post);                              // its decision, appended
    post.commit();                                            // and published
  }
}
```

The aggregate is the domain's own class, replayed through the `on<Event>` handlers it already has — the
same ones the service that owns the table replays with. Nothing about the stream, the sequence numbers,
the payload format or the rule that a stream is created once belongs to the application: they are the
same every time, so they are here.

**One thing the store refuses**, loudly, in a log line: appending a creation to a stream that already
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
does. What travels is **what it stands for**.

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

### Who sees the request on the far side

| | sees it as | when |
|---|---|---|
| a **guard**, an interceptor, a filter | `IncomingRequest.of(context)` | before the handler — which is the point: a shared guard reads the tenant or the session off a message the way it reads them off an HTTP request |
| the **handler's parameter** | `@TransportRequest()` | with the event beside it |
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

A guard cannot use `@TransportRequest()`, because a pipe runs **after** the guards — hence
`IncomingRequest`, which is the same decode reachable from the `ExecutionContext`. What the publishing
service put in its context (a tenant, a user, a locale, a feature flag) is on the envelope's metadata,
so authorisation on a message is the same code as authorisation on a request.

`src/inbound/request-propagation.spec.ts` is that chain as a test: the guard sees the tenant, the saga
reads the application's own context back, the request-scoped command handler resolves under the same
correlation id, and a delivery whose tenant is refused never reaches the ingestion.

---

## Upstream-compatible mode

An application that wants exactly what nestjs-transport-eventbus does, and nothing this library added:

```ts
@Injectable()
@Publisher(EVERY_NAMESPACE)         // one destination, no selection: upstream's mode
export class RabbitPublisher {
  @Client({ transport: Transport.RMQ, options: { urls: [...], queue: 'events' } })
  client: ClientProxy;
}

export class SomethingHappenedEvent { constructor(readonly message: string) {} }

@Module({
  imports: [DiscoveryModule],
  providers: [
    ...transportEventBusProviders,
    { provide: TransportIdentity, useClass: MyServiceIdentity },
    { provide: RequestContextCodec, useClass: CorrelatedRequestContext },
    RabbitPublisher,
  ],
})
export class TransportModule {}
```

and on the receiving side:

```ts
@EventPattern(TRANSPORT_EVENT_BUS_PATTERN)
receive(@TransportEvent() event: IEvent): void {
  this.eventBus.publish(event);
}
```

An event with no `@EventType` already goes out under the single pattern, so upstream's shape needs
nothing declared; a service that wants **declared** events under one pattern too overrides the pattern
in its serializer, as above. A class that implements `publish` keeps upstream's behaviour entirely —
the bus calls it instead of emitting on the client.

Two caveats, both from `@nestjs/cqrs` 12 and both in `NOTICE.md`: the event class has to be declared
with `@EventType` for the far side to rebuild it (otherwise no handler matches it, silently), and this
path has no inbox — a redelivery reaches the handlers again.

---

## Testing without a broker

The receiving half is [`MemoryServer`](https://github.com/camcima/nestjs-memory-microservices), which
is not ours: it registers the handlers Nest already wrapped with guards, interceptors, pipes and
filters, and invokes them in process. `MemoryClient` is the emitting half, and it is here because a
topic exchange does two things that package does not: it is a `ClientProxy` (so the routing table, the
routing table and the serializer are exercised as they are in production) and it matches patterns
(`posts.PostCreated.<id>` against the binding `posts.PostCreated.*`). Every message is serialised,
`JSON.parse(JSON.stringify(...))`'d and deserialised, so a wire-format bug cannot hide.

```ts
import { MemoryClient, startInProcessService } from '@nestposts/transport-eventbus';

const consuming = await startInProcessService({ imports: [ConsumingModule] });

@Injectable()
@Publisher(POSTS_NAMESPACE)
class PublishingOutbox {
  readonly client = new MemoryClient({
    servers: () => [consuming.server],
    serializer: new MemoryEventEnvelopeSerializer(),
  });
}

consuming.app.get(PublishingOutbox).client.bindings();   // the in-process `list_bindings`
```

`startInProcessService` starts a service the way production starts it. It exists because
`createTestingMicroservice` starts it with `init()`, and in Nest 12 `NestMicroservice.init()` runs the
bootstrap hooks **twice** — which binds every `@EventsHandler` twice, and delivers every event twice
to a suite that is there to prove one delivery is one thing. It also takes an already compiled testing
module, which is how a spec replaces a destination's client:

```ts
const tagging = await startInProcessService(
  await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(POST_EVENTS_CLIENT)
    .useValue(new RecordingClient())
    .compile(),
);

tagging.app.get<RecordingClient>(POST_EVENTS_CLIENT).sent;      // pattern + { data, metadata }, as they left
```

`RecordingClient` keeps what it was asked to send instead of sending it — the pattern it went out
under and the two halves of the envelope, exactly as a transport would have received them.

`src/in-memory/transport-loop.spec.ts` is the worked example: two services, each able to reach the
other, the real class arriving, the request restored, a redelivery reaching nobody, and the loop cut
by the origin mark.

---

## What a message looks like

On RabbitMQ, the two halves of the envelope are the two halves of an AMQP message:

```
routing key  posts.PostCreated.9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60

headers      cqrs-transport-message-type   posts.PostCreated#2.0.0
             cqrs-transport-identifier     0f0d2a5e-…                  ← idempotency
             cqrs-transport-timestamp      2026-09-08T12:00:00.000Z
             cqrs-transport-origin         tagging                     ← cuts the loop
             cqrs-transport-tags           postId=9f1d1f36-…
             cqrs-transport-correlation-id 7b2c…                       ← the request, across services

body         {"pattern":"posts.PostCreated.9f1d…","data":{"postId":"9f1d…","title":"Nest","version":2,
              "occurredAt":{"@date":"2026-09-08T12:00:00.000Z"}}}
```

The body is Nest's own envelope for a microservice message (`{ pattern, data }`), and `data` is the
event as the application wrote it. Whoever opens that message in a management UI, a shovel or a
dead-letter queue reads the fields, not a wrapper — and everything this library adds is in the headers,
where a broker expects to find routing facts.

The one thing the body still encodes is a `Date`: `{"@date":"…"}` goes out and a `Date` comes back,
because JSON has no date type and JavaScript has no field types at runtime to guess one.

In process there are no headers, so `MemoryEventEnvelopeSerializer` puts both halves in the value —
same pair, same names.

---

## Adding a transport

**Two classes, and they are the pair Nest already asks for**: how a message is written, and how it is
read. Nothing else in the library learns the protocol.

```ts
export class KafkaEventEnvelopeSerializer extends EventEnvelopeSerializer {   // how it is written
  protected serializeEnvelope(envelope: EventEnvelope<Record<string, unknown>>, packet: ReadPacket) {
    return {
      pattern: String(packet.pattern).split('.').slice(0, 2).join('.'),   // the topic, if the key is not it
      data: { key: envelope.metadata[TRANSPORT_TAGS], value: envelope.data, headers: envelope.metadata },
    };
  }
}

export class KafkaEventEnvelopeDeserializer extends EventEnvelopeDeserializer {   // and how it is read
  deserializeEnvelope(value: unknown, options?: Record<string, unknown>): IncomingEnvelope {
    // pull the body and the headers out of what this transport delivered
  }
}
```

Name them in that transport's options (`serializer`, `deserializer`) and the client in a
`@Publisher(...)`, and the destination works. The pattern it is emitted under arrives as
`packet.pattern` — `EventAddress.routingKey`, which every transport here uses as it is; a transport
whose addressing differs rewrites it in `serializeEnvelope`, above, which is the only place that has
a reason to know.

Nothing else changes — not the forwarder, not the envelope, not the routing table. The forwarder emits
an `EventEnvelope` under the event's own key and never learns a protocol.

---

## Reference

### What the application declares

The options of `forRoot` are the table in **Start it**, above. Under them are the same four bindings the
library asks for, which a service composing the provider arrays by hand binds itself:
`TransportIdentity` (required), `RequestContextCodec` (defaulted), and — for a service that receives —
`IngestionSink` and `MessageInbox`.

`transportEventBusProviders` brings the outbound half and the bus itself
(`TRANSPORT_EVENT_BUS_SERVICE`, `TRANSPORT_EVENT_BUS_PUBLISHER`, `OutboxRouting`,
`EventEnvelopeFactory`);
`eventIngestionProviders` adds `EventIngestion`. Both are plain arrays: spread them into your module's
`providers` and export what your application's own modules inject.

### The pieces you will name

| | |
|---|---|
| `@EventType` (in `@nestposts/platform`) | the event's identity on the wire |
| `@Publisher(namespace)` / `@Publisher(EVERY_NAMESPACE)` | a destination: this class holds its client, and takes those namespaces |
| `@ExcludeDef()` | the event that does not run locally, only remotely |
| `EventEnvelope` | what crosses: `data` (the event) and `metadata` (a flat map of strings) |
| `RmqEventEnvelopeSerializer` / `RmqEventEnvelopeDeserializer` | the RabbitMQ wire: body and AMQP headers, through `RmqRecordBuilder` |
| `MemoryEventEnvelopeSerializer` / `MemoryEventEnvelopeDeserializer` | the in-process wire: both halves in the value |
| `@TransportEvent()` / `TransportEventPipe` | the parameter that is the event, rebuilt from the envelope |
| `@TransportRequest()` / `TransportRequestPipe` | the parameter that is the request the message belongs to |
| `IncomingRequest` | the same request, for a guard, an interceptor or a filter |
| `EventAddress.everyEventOf(namespace)` / `.everyEventOf(EventClass)` | the binding: `posts.#`, or `posts.PostCreated.*` |
| `EventIngestion.ingest(event)` | what a controller calls |
| `IngestionSink` / `MessageInbox` | the two ports of the inbound half |
| `TransportEventBusModule.forRoot` / `.forRootAsync` | the transport, started in one call |
| `DatabaseModule.forRoot` / `.forFeature` (in `@nestposts/platform`) | the connection, and the tables each module owns |
| `eventStoreProviders` / `EventSourcedRepository.of(Aggregate)` | the event store, the sink that fills it, and the replay |
| `EventStore` / `MikroOrmEventStore` / `eventStoreEntities` | the stream's port, its adapter and its table |
| `isIngested` / `originOf` / `identifierOf` | what an event says about where it came from |
| `EventEnvelope` / `EventAddress` | the wire format, and what an event says about itself — its message type, its tags and its `routingKey` |
| `MemoryClient` / `startInProcessService` / `RecordingClient` | the doubles |

### Environment

`TRANSPORT_EVENT_BUS_PATTERN` renames the single pattern (upstream's, and the default for events with
no namespace).
