# nest-graphql-posts

POC: **NestJS 12** + **@nestjs/cqrs 12** + **MikroORM 7** + **@nestjs/graphql 14 (Apollo)** com subscriptions GraphQL alimentadas **pelo próprio `EventBus` do CQRS**, numa API DDD de posts e tags. É a reescrita em TypeScript do [axon-graphql-posts](https://github.com/Manuel-Antunes/axon-graphql-posts) (Axon Framework 5 + Quarkus), com a mesma estrutura e o mesmo schema.

Hoje é um **monorepo Nx com duas aplicações** que conversam por **RabbitMQ**: a `posts-api` (híbrida — HTTP, WebSocket e um microserviço no mesmo processo) e o `tagging` (microserviço puro, sem porta nenhuma), com o domínio e a infraestrutura em `libs/`. A saga que dá a primeira tag a um post é **coreografada** entre as duas — ver *The shape of the monorepo* e *Events across services*.

A ideia central: o `EventBus` do @nestjs/cqrs **é um `Observable`** do RxJS (um `Subject` por baixo) — o mesmo objeto em que os event handlers e as sagas se inscrevem. Uma subscription GraphQL é, no fundo, "devolva um async iterator". Então basta ligar um ao outro.

Em cima disso, o projeto acrescenta a peça que o @nestjs/cqrs não tem: **CQSRS — Command, Query, *Subscription* Responsibility Segregation** (`libs/cqsrs`). Um bus próprio para a terceira mensagem, com `subscribe` no lugar de `execute`:

| | mensagem | decorator | handler | bus | resultado |
|---|---|---|---|---|---|
| command | `Command<T>` | `@CommandHandler` | `execute` | `CommandBus` | `Promise<T>` |
| query | `Query<T>` | `@QueryHandler` | `execute` | `QueryBus` | `Promise<T>` |
| **subscription** | **`Subscription<TEvent, TCriteria>`** | **`@SubscriptionHandler`** | **`subscribe`** | **`SubscriptionBus`** | **`Observable<TEvent>`** |

E o filtro é da mensagem, não do transporte: toda `Subscription` tem um método `filter(event)`, e o critério que ele lê (`{ postId }`) **é também a chave** pela qual o bus acha o stream — dois assinantes de `onPostUpdated(postId: X)` recebem o mesmo `Observable` e custam **uma** inscrição no `EventBus`.

E a request é uma só, do começo ao fim da cadeia. Os command handlers são `{ scope: Scope.REQUEST }`, a borda cria uma `PostRequest` cuja chave é o próprio `PostId`, e o [request scoping/propagation](https://docs.nestjs.com/recipes/cqrs#request-scoping) do @nestjs/cqrs a leva do command para os eventos, dos eventos para a saga, e da saga para os commands que ela despacha — inclusive os de outro agregado. É o `@TargetEntityId PostId postId` + `@EventTag` da versão Axon, em que um id gerado na borda roteava o command e marcava os eventos, dito com a ferramenta do Nest: um `createPost` produz `PostPreCreated` → `PostCreated` **carimbados com o mesmo objeto** — e a request atravessa também o **broker**, porque o passo do meio é de outro serviço (`libs/transport-eventbus` escreve no envelope o que ela representa, e o outro lado a reconstrói).

Estado em **SQLite** via MikroORM, um arquivo por aplicação; a `posts-api` tem read model e o `tagging` tem um event log próprio e nenhuma projeção.

```
mutation createPost(input, @CurrentAuthor() author)                      [protocolo → command: o AutoMapper
                              │  mapper.mapAsync(input, CreatePostInput,     monta o CreatePost, gera o PostId,
                              │    CreatePost, { extraArgs: () => ({ author }) })  e recebe o autor por extraArgs]
                              │
                              └─► commandBus.execute(command, new PostRequest(command.postId))
                                       │                          [a request nasce na borda; sua chave é o PostId]
                                       ▼
                  CreatePostCommand.Handler  @CreateRequestContext()     [aplicação — mensagem + handler num
                     │                      { scope: Scope.REQUEST }      arquivo só (namespace), um fork do
                     │                      @Inject(REQUEST)              EntityManager por command, resolvido
                     │                                                    no ContextId da PostRequest]
                     ├─► Post.create(...)   [domínio — valida (Zod), apply(PostCreatedEvent) → onPostCreatedEvent]
                     ├─► PostRepository.save(post)                       [persist + flush = uma transação]
                     └─► post.commit()      [publica os eventos não-commitados no EventBus — DEPOIS de salvar, e
                                             carimbados: mergeObjectContext(post, this.request)]
                              │
                              ▼
                  TransportEventBusService (é o IEventBus) ──┬─► EventBus local (Subject do RxJS)
                     │                                       └─► outbox: posts.PostPreCreated.<postId> ──► RabbitMQ
                     │                                              [quem decide a primeira tag é apps/tagging;
                     │                                               a volta é posts.PostCreated.<postId>]
                     │
                     ├── ofType(PostPreCreatedEvent) ──► InProcessTagAssignment (@Saga)  [só na suíte: em produção
                     │                                     └─► CompletePostCommand        quem decide é o outro serviço]
                     ├── ofType(PostCreatedEvent) ──┬─► OnPostCreatedSubscription.Handler.subscribe()
                     │                              │      └─► PostView do payload ──► onPostCreated (o post COMPLETO)
                     │                              └─► ProjectPostCompletion  [se o evento veio de fora, ele vira
                     │                                                          estado aqui: v2, publishedAt, a tag]
                     └── ofType(PostUpdatedEvent) ──► OnPostUpdatedSubscription.Handler.subscribe()
                                                                    │
                                                                    ▼
                  SubscriptionBus: filter(event) da própria mensagem + share por chave (id + critério)
                                   um stream por critério; desliga quando o último assinante sai
                                                                    │
                                                                    ▼
                  PostSubscriptionResolver: subscribeAsAsyncIterable(bus, new OnPostUpdatedSubscription.OnPostUpdated({ postId }))
                                   MapSubscriptionInterceptor(PostUpdatedEvent, PostView): traduz cada evento
                                   que passa pelo stream  ──► @Subscription({ resolve })
                                                                    │
                                                                    ▼
                  Apollo ──► graphql-ws (WebSocket em /graphql) ──► { "data": { "onPostUpdated": { ... } } }
```

## Stack

| Peça | Versão |
|---|---|
| Node | 22 (`require(esm)` nativo — o MikroORM 7 é ESM-only) |
| TypeScript | 6 (o 7 ainda não expõe a API programática que o Nest CLI usa) |
| NestJS (`@nestjs/core`, `platform-express`) | 12.x |
| `@nestjs/cqrs` | 12.x — `Command<T>`/`Query<T>` tipados, `WithAggregateRoot`, `@Saga`, `ofType` |
| `@nestjs/graphql` + `@nestjs/apollo` + `@apollo/server` | 14.x / 5.x — schema-first (`typePaths`), subscriptions por `graphql-ws` |
| MikroORM (`core`, `sqlite`, `nestjs`, `decorators`) | 7.x — `defineEntity`, `findByCursor`, `@CreateRequestContext` |
| Zod | 4.x — os value objects |
| AutoMapper (`@automapper/core`, `classes`, `nestjs`) | 9.x — `@AutoMap()` nas classes (e no shape Zod, pelo `DECORATOR_REGISTRY`, nos DTOs gerados), perfis, `typeConverter` para os value objects, e `MapPipe`/`MapInterceptor` para que nenhum resolver chame o mapper (ESM-only, como o MikroORM: roda pelo `require(esm)` do Node) |
| Vitest + `unplugin-swc` | testes (a receita do Nest para SWC; o Jest não faz `require()` de ESM no Node 22) |
| Nx | 23.x — `@nx/js/typescript` (build e typecheck por `tsc --build`) e `@nx/vitest`; **nenhum bundler** |
| `@nestjs/microservices` | 12.x — transporte RabbitMQ com `wildcards: true` (exchange `topic`, o pattern **é** a routing key) |
| RabbitMQ | 4.x (`docker-compose.yml`) — um exchange `topic`, uma fila por serviço, bindings declarados pelas aplicações |

## The shape of the monorepo

> The chapters from here to *Do Axon 5 pro @nestjs/cqrs* are in English, per the rule in `CLAUDE.md`
> that new documentation is written in English. The surrounding text predates that rule.

**`libs/` has domain and infrastructure. `apps/` has application and presentation.**

The line is not between services, it is between **layers** — and that is what makes a library
reusable. Domain is rule and infrastructure is how the rule persists: both belong to the *module*
(posts, users), and more than one application can import them. Application is flow — which command
exists, which query answers what, which event chains into the next step — and flow belongs to
**whoever executes it**.

What that buys is visible in `apps/tagging`: it imports `libs/posts` and gets the `Post`, its events,
its rules (including which tag is the default) and its repositories. It does not get the GraphQL
layer, the projections or the command handlers of the other application — which would be handlers
wired against tables it does not have. Before the split there were two ways out of that, and both were
wrong: import everything, or redeclare the event on the other side.

| project | what it is |
|---|---|
| `libs/platform` | the shared domain (aggregate root, soft delete, delegation, `@EventType`) and the shared persistence mechanisms |
| `libs/users` | the user aggregate, its ORM mapping, its repositories and the Better Auth adapter |
| `libs/posts` | the post and tag aggregates, their ORM mappings and repositories |
| `libs/cqsrs` | CQSRS: the third CQRS message. Knows nothing about GraphQL |
| `libs/validated-dto` | the Zod → DTO / value object mixins |
| `libs/transport-eventbus` | the CQRS event bus across services. Knows nothing about this domain |
| `apps/posts-api` | the GraphQL API. A **hybrid application**: HTTP and WebSocket, plus a RabbitMQ microservice in the same process |
| `apps/tagging` | one step of the saga. A **full microservice**: no HTTP port at all |

Each project is a pnpm workspace package, and a file is imported by its own path —
`@nestposts/posts/domain/post/post.entity` — through a wildcard `exports` map. The domain has no
barrel, for the same reason it never had one: a barrel is the one thing that could turn the
arrangement into a real cycle. `pnpm graph` draws the result, and the dependency graph is the layer
graph.

### The rules, unchanged

1. **One class per handler.** Every command, query and subscription has its handler class, next to the
   message it handles.
2. **The filter belongs to the message.** Whoever asks for a subscription assembles the *criteria*;
   whoever wrote the subscription decides what they *mean*. `match` lives on the message class, in the
   application layer — the interface never sieves a stream.
3. **The domain raises, the application listens.** Events live in `domain/*/event` and are raised by
   the entities, through `apply(...)`. Whoever listens lives in the application layer:
   `application/post/event` (the projections), `application/post/saga` (the sagas),
   `application/post/subscription` (the subscriptions).
4. **The command decides and saves; the event notifies and orchestrates.** The handler calls the
   domain, stores the entity and only then calls `commit()`. A saga writes nothing: it dispatches
   commands.

### Where each thing lives

```
libs/platform/src
├── domain/shared
│   ├── domain-event, aggregate-root, base-entity   # the marker of a fact + AggregateRoot(WithSoftDelete(BaseEntity))
│   ├── event-type                                  # @EventType: namespace.Name#version + the tags, and the
│   │                                               #   registry that turns a message type back into its class
│   ├── soft-delete                                 # SoftDeletion (embeddable) + WithSoftDelete (the mixin)
│   ├── delegation                                  # Delegate(): mixin + cast; DelegatedRef/delegateRef
│   └── zod-entity, validation-error                # the entity's own state, validated by its schema
├── infrastructure/persistence
│   ├── request-context                             # reuses the ORM's context, or opens one — what makes
│   │                                               #   Post.author resolve inside a WebSocket or a queue
│   ├── helpers/value-object-type                   # the VO ↔ column bridge: a Type generated from the class
│   ├── delegation/delegated-reference              # a Reference that serves a delegation
│   └── soft-delete                                 # the property, the index, the `active` filter, the subscriber
└── testing/invalid-input                           # issuesOf(...): what a rejected input complained about

libs/posts/src
├── domain/post
│   ├── post.entity                                 # Post: domain entity AND aggregate root, in one class
│   │                                               #   decide: create()/complete()/update()/assignTag() → apply(event)
│   │                                               #   evolve: on<Event>(), idempotent, because they are the replay
│   ├── post.repository                              # the port (an abstract class = the injection token)
│   ├── vo/post-id, post-title, post-content         # value objects: classes from ValidatedDto.Scalar
│   ├── schemas/…                                    # the rules those classes wrap
│   └── event/post-pre-created, post-created,        # the two phases of a creation, plus the rest of the
│       post-updated, post-deleted, post-restored    #   lifecycle. Every one carries @EventType
├── domain/tag                                       # Tag, its events, DEFAULT_TAG_ID/NAME (a domain fact)
└── infrastructure/persistence
    ├── entities/post-orm, tag-orm                   # THE MAPPING: defineEntity pointing at the domain class
    └── repositories/mikro-orm-post, mikro-orm-tag   # the adapters (findByCursor and restore live here)

libs/users/src                                       # the same shape: domain/user + its mapping and repositories,
                                                     #   plus infrastructure/auth, the only place that knows
                                                     #   Better Auth exists (the IdentityProvider adapter)

apps/posts-api/src
├── app.module, main                                 # main connects the microservice and starts both halves
├── graphql/*.graphql                                # THE SCHEMA: the definition, not the output
├── dto/graphql                                      # the shape of the data ON THE PROTOCOL — no GraphQL decorator
├── application
│   ├── post/command/create-post, update-post,       # one .command.ts per slice: inside the namespace, the
│   │   assign-tag-to-post, complete-post            #   message AND its Handler
│   ├── post/event/project-post-completion           # the projection: a decision that arrived from another
│   │                                                #   service becomes state here
│   ├── post/saga/in-process-tag-assignment          # the tagging step, doubled in process for the suite
│   ├── post/query/…, post/subscription/…            # idem, one file per slice
│   ├── shared/post-request                          # PostRequest extends AsyncContext: the key (the PostId)
│   │   post-request-context.codec                   #   and how it crosses the wire
│   ├── tag/command/create-tag, user/query/find-author
│   └── user/user-provisioning                       # the domain profile, born at sign-up
├── infrastructure
│   ├── persistence/mikro-orm.config, persistence.module, default-tag.seeder
│   ├── outbox/post-events.publisher                 # @Publisher('posts'): the client of the destination
│   └── transport/transport.module, transport.config # the providers, and where the destination points
└── interfaces
    ├── graphql/*.resolver                           # one resolver per schema file
    ├── messaging/post-completion.controller         # the port of entry BY MESSAGE: @EventPattern → EventIngestion
    ├── interceptors, pipes, filters, mapper         # the edge's machinery, unchanged
    └── auth/user-provisioning.hooks                 # the other edge: Better Auth calling inwards

apps/tagging/src
├── app.module, main                                 # NestFactory.createMicroservice: no HTTP anywhere
├── application
│   ├── complete-on-post-pre-created.saga            # reacts to the event that crossed
│   └── complete-post-with-default-tag.command       # decides, on the real Post aggregate
├── infrastructure
│   ├── outbox/post-events.publisher                 # it publishes the `posts` namespace: the fact is
│   │                                                #   the Post's, and this service decided it
│   └── transport/transport.module, transport.config # where the framework's event store is BOUND:
│                                                    #   no store, no sink, no repository written here
└── interfaces/messaging
    └── post-events.controller                       # UMA entrada: `posts.#`, tudo o que o namespace
                                                     #   afirma — o que ele decide e o que ele replica
```

## Events across services

The two applications talk over RabbitMQ, and neither names the other. What they share is the domain
(`libs/posts`) and the mechanism (`libs/transport-eventbus`); everything else each of them declares
for itself.

### The library is vendored, not invented

`libs/transport-eventbus` is a vendored and adapted copy of
[nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus) (MIT, Sergey
Telpuk), plus an integration layer. Its own
[`README.md`](libs/transport-eventbus/README.md) is the usage guide, and
[`NOTICE.md`](libs/transport-eventbus/NOTICE.md) is the account: what came from upstream, what the new
versions forced, and what this repository added.

What came from upstream is the **integration point**, and it is the reason the library is built on it
rather than beside it: `TransportEventBusService implements IEventBus` stands in for the CQRS
`EventBus`. Everything that already publishes — a handler, a saga, an aggregate's `commit()` —
publishes through it, and the events that are addressable leave the process as well. Nothing in the
domain or in the handlers has to know.

Five things the versions forced, each with a symptom worth knowing:

1. **the receiving side has to rebuild the real event class.** Upstream builds an anonymous class and
   forges its `name`, because `@nestjs/cqrs` 7 matched a handler by the event's class *name*. Version
   12 stamps `{ id: randomUUID() }` on the event class when `@EventsHandler(SomeEvent)` is read, and
   filters published events by that id off the instance's constructor. A forged class carries no such
   id, so **no handler, no saga and no subscription matches it, and the event is dropped in silence**.
   Hence `@EventType` and its registry — which also settles what the wire name can be, since a random
   id generated per process cannot be one;
2. **`emit`, not `send`.** Upstream awaits a reply for an event; over RabbitMQ that needs a reply queue
   and turns a fire-and-forget event into a request;
3. **the decorators write metadata instead of returning a subclass.** The domain events here also carry
   `@AutoMap()` properties, and AutoMapper reads `design:type` metadata off the class it was told
   about — a substituted class is a class it does not know;
4. **nothing in the library imports `CqrsModule`.** In version 12 `forRoot()` is a *dynamic, global*
   module of the same class, and a dynamic module is not the static class: importing the static one
   alongside these providers yields a second `EventBus`, whose handlers nobody registered. Every local
   handler, saga and subscription would stop being called, with nothing in the log;
5. **`INestMicroservice.init()` runs the bootstrap hooks twice**, so the CQRS explorer binds every
   handler twice and every event is handled twice. `listen()` — what
   `NestFactory.createMicroservice(...)` calls — registers once, and it is the path the suites take.

### The code says what goes out; the configuration says where

A destination is a provider holding a client, and what it declares is the **namespaces** it takes:

```ts
@Injectable()
@Publisher(POSTS_NAMESPACE)
export class PostEventsPublisher implements ITransportPublisherEventBus {
  constructor(@Inject(POST_EVENTS_CLIENT) readonly client: ClientProxy) {}
}

@EventType({ namespace: POSTS_NAMESPACE, tags: ['postId'] })
export class PostCreatedEvent { /* … */ }
```

**The event says what it is; the destination says what it takes.** The namespace in `@EventType` is
already the event's identity on the wire — `posts.PostCreated#2.0.0` — so an event that also named its
destinations would be the same fact written twice, in two places to keep in step, with a deployment
detail sitting inside a domain event. It is also what `libs/posts` no longer imports: the domain events
depend on `@nestposts/platform` and on nothing else, and the transport library knows them only by the
namespace they declare.

A new event in a namespace some destination already takes goes out routed, with nothing added anywhere.

**What a service publishes is its contract**, and a contract that lives in a configuration file is a
contract that changes without passing through code review. Where the destination points — the broker,
the exchange, the protocol — is configuration, and it lives in
`infrastructure/transport/transport.config.ts`, together with the transport's serializer and
deserializer: what goes on the wire is declared where `@nestjs/microservices` already asks for it.

An event whose namespace nothing takes stays in the process, which is the right default for the events
a domain is mostly made of — a `tags` event in a service that publishes `posts` is an internal fact,
not a misconfiguration — and so does an event with no `@EventType`, unless a destination declares
`EVERY_NAMESPACE`, which is upstream's "one bus, everything" mode. Two destinations may take the same
namespace: that is fan-out, the same fact on a broker and on an audit bus, and the table writes it to
the log because it is also how a duplicate happens. What the table refuses loudly instead of silently:
a `@Publisher` with no namespace (nothing would ever be routed to it) and one whose `client` is not a
`ClientProxy` (injection would pass and the first event would fail, far from the cause).

The routing key is the event's own — `EventAddress.routingKey`, `namespace.Name.aggregateTag` — three segments, because a topic
exchange's key serves two things that pull against each other: **selection** (who binds to what) and
**ordering** (what lands on the same consumer). With the first two segments from the message type, a
consumer binds to `posts.PostCreated.*` and receives only what it asked for; with the third from the
event's tag, the whole key identifies the instance.

### What a message is: the event, and what is said about it

An `EventEnvelope` has two properties, and on RabbitMQ they are the two halves of an AMQP message:

```
routing key  posts.PostCreated.9f1d1f36-…

headers      cqrs-transport-message-type   posts.PostCreated#2.0.0     ← resolves the class
             cqrs-transport-identifier     0f0d2a5e-…                  ← idempotency
             cqrs-transport-origin         tagging                     ← cuts the loop
             cqrs-transport-tags           postId=9f1d1f36-…
             cqrs-transport-correlation-id 7b2c…                       ← the request, across services

body         {"pattern":"posts.PostCreated.9f1d…","data":{"postId":"9f1d…","version":2,
              "occurredAt":{"@date":"2026-09-08T12:00:00.000Z"}}}
```

The body is Nest's own `{ pattern, data }` and `data` is the event as the application wrote it, so a
management UI, a shovel or a dead-letter queue shows the fields rather than a wrapper around them;
everything the integration adds rides in the headers, where a broker expects routing facts to be. The
pair that decides this is per transport — `RmqEventEnvelopeSerializer` builds the message with Nest's
own `RmqRecordBuilder`, `RmqEventEnvelopeDeserializer` reads the headers back — and the in-process pair
carries both halves in the value, because there are no headers to carry them.

On the receiving side the controller's parameter **is** the event: `@TransportEvent()` is a `@Payload()`
bound to a pipe that rebuilds the declared class from the envelope, so a controller parses nothing and
extra pipes compose with it. `@TransportRequest()` is the other half — the `AsyncContext` the message
belongs to — for a controller that dispatches a command itself instead of handing the event to the
ingestion, and `IncomingRequest.of(executionContext)` is that same request for a **guard**, which runs
before any pipe. Whatever the publishing service put in its context — a tenant, a session, a locale —
is on the envelope's metadata, so authorising a message is the same code as authorising a request.

That is also why a consumer can bind a **namespace** and be done: `everyEventOf(POSTS_NAMESPACE)` is
`posts.#`, one entry whose parameter is whichever event arrived, as the class it is. `apps/tagging`
does that, because a service that keeps another's stream wants all of it — a binding per event type is
a list that silently misses whatever the other service adds next, since an event nobody bound to is
dropped by the exchange without a word. `apps/posts-api` binds `everyEventOf(PostCreatedEvent)`
instead: it owns the read model and waits for one decision, not for the namespace it publishes itself. One detail the port has to add that Quarkus does not: a `Date` goes out as
`{"@date":"…"}`, because JSON has no date type and JavaScript has no field types at runtime to guess
one back.

### Each delivery happens once, and three guards say so

| guard | where | what it catches |
|---|---|---|
| the origin mark | on the message, added on the way out | the event this service produced and got back — which is what keeps "everything published is forwarded" and "everything received is published" from feeding each other forever |
| the inbox | one row per message, in the same transaction as the work | a redelivery. No broker delivers exactly once: a nack, a restart before the ack, a requeue on timeout all bring the same message again |
| the aggregate | `Post.isComplete()`, read by the command handler | the same decision arriving as a *different* message — and it is the only guard that survives an emptied inbox |

The inbox's insert is `on conflict do nothing`, not a query followed by an insert: two deliveries both
pass a query before either inserts, and the conditional insert settles it in the database, which is
the only place the decision is serialisable.

### The request crosses the wire

The edge creates a `PostRequest` and the CQRS request scoping carries it from the command to the
events, from the events to the saga, and from the saga to the commands it dispatches. Across services
it is not the context that travels — an `AsyncContext` holds a `ContextId` that means nothing
elsewhere — but **what it stands for**: `PostRequest.toAttributes()` says which keys go on the
envelope, and `PostRequestContextCodec` rebuilds an equivalent context on the other side, where
`PostRequest.of(event)` answers exactly as it does here. Correlation and causation ride along by
default, which is what lets a log line in the second service be traced back to the mutation in the
first.

### A post is born in two phases

```
apps/posts-api                    routing key                        apps/tagging
──────────────────────────────────────────────────────────────────────────────────────────
createPost → PostPreCreated  ──▶  posts.PostPreCreated.<postId>  ──▶  decides the first tag
  answers version 1, no tags                                                │
ProjectPostCompletion        ◀──  posts.PostCreated.<postId>      ◀──  Post.complete(...)
  the read model reaches version 2
  onPostCreated delivers the COMPLETE post
```

`Post.create(...)` raises `PostPreCreatedEvent` and answers at version 1 with `publishedAt` null;
`Post.complete(tags, now)` raises `PostCreatedEvent` at version 2 and is what `isComplete()` reads. A
post born *with* tags goes through both in one unit of work, so "where does a Post come from" keeps a
single answer.

The cost is deliberate and worth stating: **`createPost` answers before the post is complete**, and
`onPostCreated` therefore means "it is complete" rather than "it was born". Whoever wants the finished
post observes the subscription.

`apps/tagging` has **no read model**: no `posts` table it writes, no projections, no queries. It
event-sources the Post instead — what it ingests is appended to that aggregate's stream, the `Post` is
replayed from it with `loadFromHistory`, it decides against the aggregate's own state, and its decision
is appended and published. That is also why it ingests `posts.PostUpdated`, `posts.PostDeleted` and
`posts.PostRestored`, which nothing there reacts to: a service that writes to a stream has to see the
same history, or the next decision is taken against half of it.

**None of that is written in the service.** Two lines in its `TransportModule` —
`...eventStoreProviders` and `EventSourcedRepository.of(Post)` — plus `eventStoreEntities` in its
MikroORM list, and the framework does the rest: the stream, the sequence numbers, the payload format,
the sink that appends every ingested event to the stream of the aggregate its `@EventType({ tags })`
names, the replay, and the refusal to append a second creation to a stream that already has one. The
Axon side has no such code either, for the same reason: an event store is a framework's job, and a
service that writes its own writes the framework once per service.

In the `apps/posts-api` suite the tagging step is doubled in process (`InProcessTagAssignment`, behind
`POSTS_TAGGING_IN_PROCESS`), and that is declared doubling rather than a second production path:
eventual consistency makes an in-flight message cross the boundary of a test that isolates each case.
The real path has its own test, out of the suite, where there is nobody to share isolation with.

### Four levels of test, and what only each one proves

| | where | what it proves |
|---|---|---|
| unit / slice | every project, beside the code | the rule, the handler, the mapping |
| integration | `libs/transport-eventbus/src/**`, `apps/posts-api/test/persistence` | the envelope (a `Date` that survives the wire), the routing table's three refusals, the inbox's atomicity, the ORM mapping |
| one hop, in process | `libs/transport-eventbus/src/in-memory/transport-loop.spec.ts` | two services over `MemoryServer` and `MemoryClient`, each able to reach the other: the real class arrives, the request is restored, one correlation id per request, a redelivery reaches nobody, the loop is cut |
| the whole saga | `pnpm test:saga` (`docker/e2e/`) | **two processes over real RabbitMQ**: version 1 without tags, the complete post on `onPostCreated`, each service's durable state, both inboxes, idempotency through the broker's management API, the replica channel, and **one correlation id for the whole saga** — read off the AMQP headers of both messages, each published by a different process |

```
$ pnpm test:saga
### 5. a topologia que as duas aplicações declararam
    nestposts.events  posts.PostCreated.*      ->  nestposts.posts-api.post-completed
    nestposts.events  posts.#                  ->  nestposts.tagging.post-events
### 6. o teste
  PASS  createPost respondeu v1 sem tag — o tagueamento saiu do fluxo da escrita
  PASS  onPostCreated emitiu o post pronto: v2, tags ["Untagged"]
  PASS  posts-api: o post está na v2, publicado, com ["Untagged"]
  PASS  tagging: posts.PostPreCreated#1.0.0, posts.PostCreated#2.0.0
  …
=== SAGA COREOGRAFADA: 12 passaram, 0 falharam ===
```

That listing is the design's own summary: the topology *describes* the system, which is what one
channel per purpose buys and what a single "catch everything" queue would have cost.


## Do Axon 5 pro @nestjs/cqrs (e por que está assim)

| Axon 5 (versão Java) | @nestjs/cqrs 12 (este projeto) |
|---|---|
| `@EventSourced` + `@EntityCreator` + `@EventSourcingHandler` | `WithAggregateRoot(BaseEntity)`: `apply(evento)` chama `on<Evento>(evento)`; `loadFromHistory` é o replay |
| `events.raise(evento)` pela porta `DomainEventPublisher` + `EventAppender` | `this.apply(evento)` guarda em `getUncommittedEvents()`; `EventPublisher.mergeObjectContext(post)` liga `commit()` ao `EventBus` |
| `@CommandHandler` em classe própria, `@InjectEntity Post` | `@CommandHandler(Cmd)` num `namespace` junto da mensagem (`CreatePostCommand.Handler`); o handler carrega pelo repositório |
| `ProcessingContext` por command (evento + linha commitam juntos) | `@CreateRequestContext()` do MikroORM: um fork do EntityManager por command; `flush` é a transação; `commit()` vem depois |
| `@TargetEntityId PostId postId` no command + `@EventTag` nos eventos: uma chave gerada na borda roteia e correlaciona | `PostRequest extends AsyncContext` com o `PostId` como chave; `commandBus.execute(command, request)` na borda e `mergeObjectContext(post, request)` no handler |
| `ProcessingContext` propagado do command para os eventos e para o que reage a eles | request scoping do @nestjs/cqrs: `@CommandHandler(Cmd, { scope: Scope.REQUEST })` + `@Inject(REQUEST)`; a saga repassa com `PostRequest.of(event)` e `request.attachTo(command)` |
| `@EventHandler` + `ProcessingContext.onAfterCommit(...)` despachando commands | `@Saga()`: `Observable<evento> → Observable<command>`, o `EventBus` executa o que sai |
| `subscriptionQuery` + `QueryUpdateEmitter.emit(...)` | `Subscription<Evento, Critério>` + `@SubscriptionHandler`; `subscriptionBus.subscribe(sub)` devolve `eventBus.pipe(ofType(Evento))` filtrado |
| `Flux` no `@SubscriptionMapping` + SSE | `subscribeAsAsyncIterable(bus, sub, projeção)` no `@Subscription` + graphql-ws |
| filtro por tópico avaliado no `emit` (`sub -> sub.matches(id)`) | `filter(event)` na própria `Subscription`, aplicado pelo bus dentro do stream — e o critério é a chave que compartilha o stream |
| `ScrollSubrange` / `Window` do Spring Data | `em.findByCursor` do MikroORM: itens + `hasNextPage` + cursores prontos |
| `@Embeddable record PostTitle` com validação no construtor | `class PostTitle extends ValidatedDto.Scalar(schema)`: a regra fica no schema Zod, o comportamento (`toString`/`equals`/`parse`) na classe |
| `@Embedded PostTitle title` numa entidade / num DTO | `p.type(valueObjectType(PostTitle, …))` na coluna; `PostTitle.field()` no shape do DTO. O banco continua vendo texto |
| `@Embeddable SoftDeletion` + `interface SoftDeletable` | `SoftDeletion` (embeddable) + `WithSoftDelete` (mixin de classe), com os mesmos dois pares decidir/evoluir |
| `@SQLRestriction("deleted_at is null")` + `@SQLDelete` | o filtro `active` (ligado por padrão no schema) + o `SoftDeleteSubscriber` — as duas peças que o MikroORM oferece |
| `@ManyToOne(optional = false) Author author` | `DelegatedRef<Authorship, Author>` no `Post.create` **e** a FK apontando para `authors(id)`: quem não tem a linha delegada não passa nem pelo tipo nem pelo banco |
| `Post.author: Author!` por `@BatchMapping` + DataLoader a partir do `authorId` do `PostView` | `@ResolveField('author')` → `QueryBus` → `findById`. Sem DataLoader, e sem N+1 na leitura: o repositório já popula o autor, então o identity map serve a resolução em **zero** consultas (há um teste que as conta) |
| `@ElementCollection(LAZY)` + DataLoader | `p.manyToMany(TagSchema).owner()` — `Collection<Tag>` com pivô `posts_tags`; `populate` no repositório e `dataloader: DataloaderType.ALL` no config |
| `ClassNameTypeResolver` num `@Bean` (`ReaderView` → `Reader`, `AuthorView` → `Author`) | um `__resolveType` no `@Resolver('IUser')`: o @nestjs/graphql o reconhece pelo nome e o pendura na interface |
| `@PreAuthorize("isAuthenticated()")` no `me` | o guard global do `@thallesp/nestjs-better-auth`: exigir sessão é o **padrão**, e as leituras de post são a exceção que opta por fora com `@AllowAnonymous()` |
| `Author.posts` por `@SchemaMapping` + DataLoader, recortado em memória | `@ResolveField('posts')` → `QueryBus` → `em.findByCursor` com `where: { author }`: a página é uma consulta com `limit`, não um recorte de tudo. Sem DataLoader porque `Post.author` é `String!`, então há **um** Author por resposta |
| MapStruct | **AutoMapper 9** (`@automapper/core` + `classes` + `nestjs`): `@AutoMap()` nas próprias classes — e, nos DTOs gerados, no shape Zod pelo `DECORATOR_REGISTRY`, que é o mesmo gancho por onde qualquer outro decorator de campo entra —, dois perfis (`PostProfile`, `UserProfile`), cada um declarando os value objects que atravessa com um `valueObjectConverter(PostTitle, String)` que vale para todos os mapeamentos daquele perfil, nos dois sentidos. A saída nunca passa por um resolver: ela vem por **interceptor** (`MapInterceptor` e os três do projeto — connection, subscription e o despacho polimórfico do `me`, que é o único que um mapeador não decide sozinho). A entrada vem por `MapPipe` onde o input basta; no `createPost` ela é uma chamada explícita, porque o command precisa do autor da sessão e um pipe não enxerga o `ExecutionContext` |
| Bean Validation na borda + VO no domínio | uma altura só: o domínio (Zod); o `DomainExceptionFilter` traduz para `BAD_USER_INPUT` |
| `AppGraphQlExceptionHandler` | `APP_FILTER` com um `ExceptionFilter` que **devolve** um `GraphQLError` |

## Rodando

```bash
pnpm install
docker compose up -d rabbitmq   # o transporte das duas aplicações (ou um RabbitMQ que já esteja no ar)
pnpm dev                        # as DUAS aplicações: posts-api em :3000 e tagging (sem porta)
```

`http://localhost:3000/graphql` — GraphiQL no browser, subscriptions por graphql-ws. Só a `posts-api`
tem porta: o `tagging` é acionado por mensagem e o que ele produz é mensagem.

Sem broker, dá para subir a `posts-api` sozinha com o tagueamento em processo:

```bash
POSTS_TRANSPORT=memory POSTS_TAGGING_IN_PROCESS=true npx nx serve @nestposts/posts-api
```

## Testando na mão

Terminal 1 — abre a subscription global (com [`graphql-ws` CLI](https://the-guild.dev/graphql/ws) ou qualquer cliente; ou pelo GraphiQL):

```graphql
subscription { onPostCreated { id title version author { id name email } } }
```

Terminal 2 — dispara o command:

```bash
curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"mutation { createPost(input:{title:\"Nest + GraphQL\", content:\"oi\"}) { id title version author { id name } tags(first: 5) { edges { node { id name } } } } }"}'
```

O terminal 1 recebe `{"data":{"onPostCreated":{"id":"…","title":"Nest + GraphQL","version":1,"author":{"name":"manuel",…}}}}`.

`author` é o `type Author`, e não o nome: é o único campo de um payload de subscription que custa uma
consulta, porque o evento carrega `authorId` mas não o e-mail de quem escreveu. Pedir só
`onPostCreated { id title version }` não toca o banco, como antes.

A mutation responde o post **como ele nasceu** — `version: 1`, sem tags — e logo em seguida `onPostUpdated` entrega a `version: 2` com a tag `Untagged`. É a diferença de consistência entre os dois frameworks, explicada abaixo.

Subscription filtrada por tópico e o resto:

```graphql
subscription { onPostUpdated(postId: "<ID>") { id title content version } }
```

```bash
curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"mutation { updatePost(input:{id: \"<ID>\", title: \"editado\"}) { id title version } }"}'

curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ post(id: \"<ID>\") { id title content updatedAt version tags(first: 5) { edges { cursor node { name } } } } }"}'

# cursor connection: primeira página, depois `after` = endCursor da anterior
curl -s -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ posts(first: 1) { edges { cursor node { id title } } pageInfo { hasNextPage endCursor } totalCount } }"}'
```

`me` — quem está logado, e o casting pela interface. Exige sessão, então vai pelo GraphiQL (que manda o
cookie) ou com o cookie do sign-up na mão:

```graphql
me {
  __typename
  id
  name
  email
  # só casa para quem É um Author: a resposta vem da linha em `authors`, não de uma claim do token
  ... on Author {
    posts(first: 5) {
      edges { cursor node { id title version } }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
}
```

```bash
# sign-up (guarda o cookie), e então `me` com ele
curl -s -c /tmp/posts.cookie -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"manuel@example.com","name":"manuel","password":"senha-super-secreta"}'

curl -s -b /tmp/posts.cookie -X POST http://localhost:3000/graphql -H 'content-type: application/json' \
  -d '{"query":"{ me { __typename id name email ... on Author { posts(first: 5) { edges { node { title } } totalCount } } } }"}'
```

Recém-inscrito, o `__typename` é `User` e o fragmento não casa — **`posts` nem aparece na resposta**,
em vez de voltar vazio. Conceder o papel `author` (é o que o realm do Keycloak fazia na versão Axon)
promove o **mesmo** perfil — mesmo id, mesma sessão —, e o mesmo `me` passa a casar com `... on Author`.

Houve aqui um `pnpm smoke` — um script que buildava, subia a app com banco novo, abria subscriptions por
graphql-ws e conferia contagens. Ele saiu: tudo o que ele verificava está no `posts.e2e-spec`, que sobe a
mesma aplicação e fala o mesmo HTTP e o mesmo WebSocket, só que com asserções que falham com nome e
diff em vez de um `FAIL` numa linha de log. Dois roteiros para o mesmo caminho é um que envelhece sem
ninguém notar — e era o que estava a acontecer: o script ainda mandava `author` dentro do
`CreatePostInput`, campo que deixou de existir quando o autor passou a vir da sessão.

Uma coisa saiu com ele: o script rodava contra o `dist/main` **buildado**, numa porta de verdade. O e2e
sobe o `AppModule` em processo, então hoje **nada** verifica que o artefacto buildado arranca — o
`pnpm build` diz que compila e que os `.graphql` foram copiados, não que sobe.

## Testes

```bash
pnpm test        # todos os projetos (nx run-many -t test)
pnpm test:e2e    # a posts-api inteira, por HTTP + WebSocket, com transporte em memória
pnpm test:all
pnpm test:saga   # a saga coreografada: DOIS PROCESSOS sobre RabbitMQ de verdade (docker/e2e/)
```

> Os itens acrescentados depois da divisão em monorepo estão em inglês, pela regra do `CLAUDE.md`; os
> anteriores ficaram como estavam.

- `post.entity.spec` / `tag.entity.spec` — domínio puro: sem `EventPublisher`, sem `EventBus`, sem banco. O único colaborador é o próprio aggregate root: `getUncommittedEvents()` diz exatamente o que foi disparado. O `post.entity.spec` inicializa um MikroORM **só para descoberta** (sem `ensureDatabase`, nenhuma tabela criada): desde que `Post.tags` virou relação, uma `Collection` precisa da metadata do dono para saber a que propriedade pertence. Os testes `the state returned by update is the same as sourcing the raised events` (via `loadFromHistory`) e `applying the same event twice leaves the same state` travam o contrato decidir/evoluir.
- `create-post.command.spec` — inclui os dois testes que tornam verificável a confiança na chave estrangeira: criar com um `authorId` inexistente e criar com o id de um user **sem linha em `authors`** falham na FK, sem gravar nada. São eles que justificam o handler não reler o autor.
- `create-post.command.spec`, `update-post.command.spec`, `assign-tag-to-post.command.spec`, `create-tag.command.spec` — um por fatia, ao lado do arquivo que ela ocupa, com `@nestjs/testing`. O fixture (`apps/posts-api/test/support/cqrs-testing-module.ts`) monta o `CqsrsModule` de verdade, o MikroORM de verdade num SQLite em memória, os repositórios, o `TransportEventBusModule` com a saída desligada — e **só o handler do teste**, então uma dependência acidental entre dois deles quebra o teste. Não há repositório fake: como salvar é responsabilidade do command, o banco é quem prova que ele salvou, e um `RecordingEvents` pendurado no `EventBus` prova o que ele publicou. Como os handlers são `{ scope: Scope.REQUEST }`, o teste despacha pelo `CommandBus` com uma `PostRequest`: não existe "a" instância de um handler request-scoped para pegar do módulo — e esse é justamente o caminho de produção.
- `author.entity.spec` (em `apps/posts-api/test/domain/`, porque precisa de Post **e** de Author) — o cast: que `Author.cast(user, authorship)` devolve **o mesmo objeto** (e que ele continua igual ao `User` relido de outra origem, nos dois sentidos), que uma referência não carregada carrega a cadeia inteira e aterra no `Author`, e que um user sem linha delegada é só um user. Os testes de `posted()`/`postCount()`/`wrote()` saíram com os métodos: `libs/users` não pode depender de `libs/posts`, e quem responde "os posts deste autor" é o `PostRepository.findByAuthor`, que é quem já respondia em produção.
- `user-provisioning.service.spec` — o provisionamento e a **promoção** contra o banco: promover mantém o mesmo id, acrescenta o papel ao mesmo stream (a versão vai a 2) e cria **uma** linha em `authors`; provisionar de novo depois disso não muda nada. O provedor de identidade entra como `FakeIdentityProvider` — nenhum destes testes importa `better-auth`, que é o que a porta comprou.
- `delegate.spec` — o mecanismo sozinho, com duas classes inventadas e sem ORM nenhum: o mixin encaminha método **e** getter, recusa na construção uma chave que o delegado não declara, mantém o `constructor` apontando para o sujeito, resolve o delegado de volta no sujeito castado (e resolver duas vezes dá o mesmo objeto) e empilha duas delegações sem perder a primeira.
- `find-all-posts.query.spec` — a mecânica da cursor connection de `posts`: a linha a mais que decide o `hasNextPage` nunca vaza, o `endCursor` de uma página é o `after` da seguinte.
- `in-process-tag-assignment.saga.spec` — a saga é uma função `Observable → Observable`: alimenta-se um `of(evento)` e colhem-se os commands. Completa o post com a tag padrão (cujo id é fato do domínio, não busca no banco), carimba o command com a request que veio no evento, abre uma request própria quando o evento chega sem nenhuma, completa cada post de um lote na ordem — e **não decide** sobre um evento ingerido de outro serviço, porque aquela decisão já está no fio.
- `post-request.spec` — a propagação de ponta a ponta, com os command handlers e o dublê da saga no mesmo módulo: um `createPost` abre a cadeia `PostPreCreated → PostCreated` por dois handlers request-scoped diferentes, o segundo despachado pela saga, e os dois saem carimbados com **o mesmo objeto**. Confere também que a chave viaja como *metadado*: o `PostId` chega à saga como value object, o payload do evento continua primitivo, e o carimbo (não-enumerável, sob um símbolo) não aparece no `toEqual` de um evento.
- `post-tags.resolver.spec` — o **recorte** de `Post.tags`, que é a parte da connection que é lógica nossa; o envelope saiu daqui e está no `connection.interceptor.spec`.
- `post-mutation.resolver.spec` — a borda de escrita, com o mapper **de verdade** e não um duplo: o que se afirma é a costura entre o `extraArgs` que o `createPost` passa e o `mapWithArguments` que o perfil declara. Inclui o teste que explica o desenho: um autor forjado no corpo da requisição não muda o command, porque o autor vem da sessão. E a `PostRequest`, que é o que só este resolver faz — um `execute` sem esse contexto compila, passa no e2e feliz, e quebra a saga.
- `post.profile.spec` — os mapeamentos do agregado Post, sem Nest, sem banco e sem GraphQL. O que ele prende não são os campos que o mapeamento **escreve**: são os que ele escreve *sem que ninguém tenha mandado*. Um `forMember` esquecido aparece em qualquer teste; um campo que atravessava sozinho e parou (porque perdeu o `@AutoMap()`, ou porque o nome mudou de um lado só) não aparece em lugar nenhum — o AutoMapper o deixa `undefined` e segue. Daí cada caso conferir a view **inteira**. Cobre também a travessia dos value objects nos dois sentidos e o contrato que o `preMap` sustenta: mapear a partir do objeto **cru** (que é o que o @nestjs/graphql entrega) tem de dar o mesmo resultado que mapear a partir do DTO.
- `connection.interceptor.spec` — a montagem da cursor connection, num lugar só para as três do schema: os cursores vêm de `page.from(item)`, os flags do que a página calculou (`hasPreviousPage` ← `hasPrevPage`, que é o mapeamento que pode quebrar), e a página inteira é traduzida numa passada em vez de uma por edge. Cobre os dois usos da sobrecarga — com o par de modelos e sem ele —, e que o envelope que os dois montam é o mesmo.
- `map-subscription.interceptor.spec` — o embrulho do stream, e sobretudo o caso que um `async function*` **não** cobre: um cliente que abre a subscription e fecha a aba antes de qualquer evento. Nessa posição um gerador está suspenso num `await`, e o `return()` que vem de fora entra na fila dele em vez de interrompê-lo — a fonte nunca é fechada e a assinatura fica pendurada no `EventBus`. Um vazamento por cliente que desconecta, invisível para qualquer teste que consuma um item primeiro.
- `find-author.query.spec` — o autor de um post, e **dois testes que não são sobre o resultado**: que resolver o autor de uma página de posts custa **zero consultas** (contadas no driver, com um controle que prova que o contador conta) e que o handler funciona **fora** de qualquer contexto de requisição, que é o caminho da subscription. Tirar o `'author'` do `populate` do repositório quebra o primeiro; tirar o `inRequestContext` do adapter quebra o segundo.
- `delegated-reference.spec` — as três coisas que a referência de um delegado passou a saber: que `post.author.id` responde com o `UserId` mesmo por carregar, que `delegated()` e `loadDelegated()` chegam ao mesmo `Author`, e que a referência de uma entidade comum continua a devolver o id dela **e recusa** o cast. Sem este teste, remover a peça devolveria `undefined` em silêncio, que é a pior forma de isto falhar.
- `post-author.resolver.spec` — a troca do `authorId` pelo `Author`: o id vai na mensagem como value object, o agregado volta como `AuthorView`, e um autor que já não está lá é **erro** e não `null` — `Author!` não admite um campo não-nulo vazio.
- `user-view.interceptor.spec` — o despacho polimórfico da borda, sem ORM nenhum no meio: quem decide a classe da view é `hasRole(AUTHOR_ROLE)`, lido do próprio agregado. Sem o papel vira `UserView`; com ele, `AuthorView` — e conceder o papel entre duas passagens muda o despacho, que é o que prova que a triagem não foi reimplementada ali. O teste espia o **par de identificadores** passado ao mapper, e não os campos que saíram: um despacho errado produziria uma view com todos os campos certos e o tipo errado, e nenhuma asserção sobre campos o veria.
- `user-query.resolver.spec` — `me` e o `__resolveType` juntos, que é onde a regressão moraria: o que o interceptor escolheu é o que o `__resolveType` anuncia. Se os dois discordassem, um autor receberia `User` no `__typename` e o fragmento `... on Author` deixaria de casar — uma resposta válida e errada. Também que o nome devolvido é o do **schema** (`Author`), não o da classe (`AuthorView`): errar isso quebra em runtime, no graphql-js, e não na compilação.
- `author-posts.resolver.spec` — `Author.posts` isolado: o id do parent vira `FindPostsByAuthor` como value object, e o resolver devolve o `Cursor` como o ORM o produziu. Os flags de `pageInfo` são afirmados **uma vez só**, no `connection.interceptor.spec` — antes eram três testes paralelos (aqui, em `Query.posts` e em `Post.tags`) que podiam divergir sem ninguém reclamar, porque cada connection era montada no seu próprio resolver.
- `find-posts-by-author.query.spec` — a connection de `Author.posts` contra o banco: a ordem decrescente (o contrário de `posts`), o recorte por autor (os posts de outro não entram nem no `totalCount`), um id desconhecido como página vazia em vez de erro — e que os posts voltam com `tags` e `author` **populados**, que é o contrato de que a borda depende e a razão de o método morar na porta e não no agregado.
- `validated-scalar.mixin.spec` — o value object escalar sozinho: normalização pelo schema, `toString`/`toJSON`/`valueOf`/hint numérico (inclusive `Date` → ISO, que o `JSON.stringify` não faria sozinho), igualdade por família, `parse` que não aplica um `transform` duas vezes, e as duas formas de especializar (`narrow` e sobrescrever `static schema`).
- `validated-dto-embedded.spec` — o value object **dentro** de um DTO: o construtor monta a classe, a serialização a colapsa, o `class-validator` continua reportando a mensagem do schema, e o `design:type` do campo passa a ser a classe (é o que um `@Field` sem thunk leria). Cobre opcional/nulo/default, listas, e o `Embeddable` de vários campos.
- `post-dto.spec` — a migração dos DTOs: por dentro os campos são os **mesmos** value objects do domínio; por fora sai exatamente o shape de antes, inclusive pelo caminho que o graphql-js percorre ao serializar um campo (`GraphQLID.serialize(view.id)`).
- `value-object-type.spec` — a ponte VO ↔ coluna, exercitada numa entidade de verdade num SQLite de verdade: hidrata como classe, guarda texto na coluna, aceita value object **e** texto na consulta, não gera UPDATE quando o valor não mudou, e o cursor de paginação vai e volta — inclusive um forjado, que precisa falhar.
- `user-soft-delete.spec` — a exclusão lógica contra o **banco**, e não contra objetos, como o `UserSoftDeleteJpaTest` de lá: `em.remove` marca em vez de remover, a linha da tabela filha da herança sobrevive, restaurar traz o `Author` inteiro, e o caminho do domínio (`softDelete` + `flush`) tem o mesmo efeito. Desligar o subscriber quebra três dos cinco.
- `soft-delete.spec` — o lado do domínio, sem ORM nenhum no meio: o value object (nasce vivo, e sabe se dizer) e o **mixin sozinho**, sem Post e sem User, como o `SoftDeletableTest` da versão Java — que é o que justifica ele ser um mixin: o comportamento é testado uma vez e as duas entidades herdam o teste junto com o código.
- `soft-delete-filter.spec` — o lado da infraestrutura: some das consultas sem sumir do banco, volta com `filters: { active: false }`, e **apagar o autor esconde os posts dele sem tocar nas linhas de post**.
- `subscription-bus.spec` — o `SubscriptionBus` num módulo Nest de verdade (`CqsrsModule.forRoot()`, explorer e tudo): roteia a mensagem para o seu `@SubscriptionHandler`, aplica o `filter` da mensagem dentro do stream, entrega **o mesmo `Observable`** para o mesmo critério (dois assinantes, uma inscrição no `EventBus`, o handler chamado uma vez só), separa critérios diferentes, desliga a fonte quando o último assinante sai e a religa sob demanda, e explode com `SubscriptionHandlerNotFoundException` quando ninguém trata a mensagem.
- `cqsrs.module.spec` — o módulo: `forRootAsync` nas quatro formas (`useValue`, `useFactory` com `inject`, `useClass`, `useExisting`), as opções chegando **nos dois lados** (o `subscriptionPublisher` no `SubscriptionBus`, o `eventPublisher` no `EventBus` — prova de que o resto é repassado ao `CqrsModule`), a factory de quem chama rodando **uma vez só**, e o `@SubscriptionHandler` registrado no bootstrap também pelo caminho assíncrono.
- `subscription-key.spec` — a chave: mesma coisa em qualquer ordem dá a mesma chave, `undefined` é o mesmo que ausente, `null` não é, arrays mantêm a ordem.
- `on-post-updated.subscription.spec` — o filtro por tópico como o que ele é: regra de aplicação, testada sem subir bus nenhum.
- `observable-to-async-iterable.spec` — o helper: entrega em ordem, `return()` cancela a inscrição **mesmo com um `next()` pendente**, erro propaga.
- `domain-exception.filter.spec` — a tabela exceção → `extensions.code`.
- `author.pipe.spec` / `session-user.pipe.spec` — a guarda da borda agora que ela é um pipe: o cast devolve o mesmo objeto já como `Author` e recusa nomeando o usuário quem não tem o papel — ou quem tem o papel e **não** tem a linha delegada, que é o caso que só um cast de verdade distingue; e a tradução da sessão aceita a entrada **ainda como Promise**, que é como o Nest a entrega ao primeiro pipe. O pipe entrega hoje um **id de credencial**, e não mais email/nome/papel copiados do cookie.
- `user-provisioning.hooks.spec` — a borda por onde o Better Auth chama para dentro: o id cru vira `CredentialId`, um id inválido não chega ao serviço, e uma falha ao provisionar **não** derruba o sign-up — o que é a regra que sustenta o desenho (autenticar é do provedor, provisionar é nosso).
- `mikro-orm-exception.filter.spec` — a outra tabela, a de violação de integridade → erro de usuário: FK vira `BAD_USER_INPUT` com mensagem **vaga** (distinguir "não existe" de "é leitor" seria um oráculo), unique vira `CONFLICT`, e nenhuma mensagem de driver vaza.
- `posts.e2e-spec` — o smoke test como teste: sobe o `AppModule` com SQLite em memória (`POSTS_DB` no `vitest.e2e.config.mts`), fala HTTP para queries/mutations e graphql-ws para subscriptions. Confere a ordem command → evento → entrega, que o `createPost` responde **pré-criado** (v1, sem tag) e que o post **completo** (v2, com a tag) chega por `onPostCreated`, o filtro por tópico (o assinante filtrado vê só o seu post; o global vê tudo), os erros com código, as duas connections — que desassinar tira o assinante do `EventBus` na hora, contando os `observers` do `Subject`, e que **dois assinantes do mesmo tópico compartilham um stream só**: o `EventBus` não passa de um assinante, os dois recebem o mesmo payload, e a fonte só cai quando o segundo sai. E, pendurado no `EventBus`, que a `PostRequest` criada no resolver sobrevive ao caminho de verdade (Express → Apollo → `CommandBus` → saga): todos os eventos daquela mutation carregam o mesmo objeto. O `author` de toda selection deste ficheiro é o `type Author` (`author { id name email }`), subscriptions incluídas — então a resolução do campo está exercitada por todos os testes, e o bloco `Post.author` acrescenta o que só ela permite: navegar `post → author → posts → author` e fechar o ciclo, o autor de um post ser o **mesmo** que o `me` devolve, a resolução funcionar dentro da conexão WebSocket (sem o contexto aberto no adapter o cliente receberia `data: null`), e uma leitura anónima alcançar o autor. O bloco `me` é o polimorfismo ponta a ponta, com três clientes HTTP de verdade: o autor casa com `... on Author` e pagina os posts dele (Posts completos, `tags` aninhadas inclusive), um segundo cliente que fez sign-up **sem papel** vem como `User` e a resposta sai sem `posts` — não com `posts` vazio —, pedir `posts` num `User` é erro de schema, e um terceiro que nunca autenticou leva `UNAUTHENTICATED` do guard global, antes de o resolver existir.

And the suites that came with the monorepo and the transport:

- `transport-event-bus.service.spec` — **upstream's integration suite, ported assertion for
  assertion**: what leaves and what does not, what `@ExcludeDef` costs, `publishAll`, a saga, a
  service injecting the bus, an aggregate committed through the transport publisher, and upstream's own
  mode (one destination taking `EVERY_NAMESPACE`, everything under one pattern). It is what
  proves the vendored base still behaves as it did on a stack where the event identity it relied on no
  longer exists. The last one has a name that says what it waits for — `commit()`'s publish is not
  awaited by anybody, which is a fact about `AggregateRoot` and not about this library.
- `request-propagation.spec` — **a request crossing everything it has to cross**: a guard reading the
  tenant and the user off the `ExecutionContext` before the handler, the saga reading the application's
  own context back from the ingested event, a `Scope.REQUEST` command handler resolving under the same
  correlation id, a delivery whose tenant the guard refuses never reaching the ingestion, and the same
  chain for an event raised locally, with nothing on the wire.
- `transport-event.spec` — **one entry per namespace**: `posts.#` bound once, the concrete class
  answered for whichever event arrived, an event of another namespace not reaching it, the request
  rebuilt by the application's codec and handed to the controller, and the command it dispatches
  running in that same request.
- `event-envelope.spec` — the wire format: the two halves, what the metadata answers for an envelope
  that carries none of it, the body going out as the event and not as a wrapper, the tags flattened for
  a header (separators and all), and the one thing JSON loses — a `Date` comes back a `Date`, including
  nested in an array, while a string that merely *looks* like a date stays a string.
- `event-address.spec` — what the event says about where it goes, read off the event: the namespace,
  the three-segment ordering key, the sentinel for an event with no tag, the warning for an event with
  two, one identifier per instance (so a retry is a redelivery and not a new fact), and the class name
  for an event with no `@EventType`, which is upstream's mode.
- `outbox-routing.spec` — selection by namespace: the destination that takes it, the namespace nobody
  takes, an event with no `@EventType`, a destination taking several namespaces, two taking one
  (fan-out), `EVERY_NAMESPACE`, **the two things the table refuses to do quietly** — a publisher with no
  namespace and a `client` that is not a `ClientProxy`, each naming the offending class — and the
  routing key the event addresses itself with.
- `event-reconstruction.spec` — the message becoming an event again: an instance of the **real** class
  (the test registers a handler for it, which is what stamps the id that makes matching possible), both
  wire shapes, the ingestion mark that cuts the loop, and the named fallback for a type this service
  does not declare — with the warning that says no handler will match it.
- `message-inbox.spec` — idempotency where it is serialisable: the same identifier twice, a race
  settled by the database, and the row **rolling back with the work it recorded**.
- `event-ingestion.spec` — the three guards from the outside: the service's own echo dropped before the
  inbox, a redelivery reaching the handlers once, the restored request arriving on the event, an
  undeclared type accepted instead of rejected forever, and a body that is not an envelope rejected so
  a poison message is not acknowledged.
- `request-context.spec` — one correlation id per request however many events it raises, the id a
  context arrived with surviving the next hop, and the application's own attributes crossing.
- `topic-pattern.spec` — AMQP matching: `*` is one segment, `#` is zero or more, and a namespace prefix
  does not match by accident.
- `transport-loop.spec` — **two services over the in-process transport**, each able to reach the other,
  which is the closest a suite gets to the real thing: each one bound to the routing keys it declared
  and to nothing else, the real class arriving with its dates, the request restored on the far side,
  one correlation id for two events of one request, the inbox deduplicating a redelivery, an event
  that names no destination not crossing, the origin mark keeping an ingested event from going back
  out — and an event of the service's own still going out, which is what proves the cut is about
  origin and not about the destination.
- `complete-post.command.spec` — the last step of the saga in `posts-api`: the post reaches version 2
  with the tag, the request goes through, **a second decision is success and publishes nothing**, and a
  tag that does not exist locally stops the completion instead of leaving a dangling link.
- `project-post-completion.handler.spec` — the projection: a decision another service took becomes
  state here, an event this service raised itself is ignored (the command already wrote the row), a
  redelivery does not move the post again, and a tag this service does not have is recorded **from the
  event itself** — which is why the tag's name travels next to its id.
- `event-store.spec` / `event-store.sink.spec` (transport-eventbus) — the framework's event store, on an
  aggregate of the spec's own: events read back as the real classes, numbered from zero per stream, one
  stream per aggregate, **a stream refused a second creation** (a replay would otherwise read the
  aggregate as starting over), the aggregate answered as the replay of its stream, its decision appended
  and read back — and, for the sink, an event appended to the stream its tag names, while one that names
  no aggregate is appended nowhere instead of to a stream chosen for it.
- `complete-post-with-default-tag.command.spec` (tagging) — the decision against the aggregate replayed
  from the stream, appended back to it, and dropped when the stream already carries it.
- `tagging.spec` — the service as a whole, through its own controller: its queue bound to the whole
  `posts` namespace, the decision published under `posts.PostCreated.<postId>`, both
  events in its own stream, the inbox naming who sent each message, one decision however many times the
  message is delivered, its own echo dropped, and the other service's correlation carried forward.
- `docker/e2e/saga-choreography.mjs` — **the two processes over real RabbitMQ**, and the only test that
  can prove the topology: `createPost` at version 1 without tags, the complete post arriving on
  `onPostCreated` through the whole loop, each service's durable state, both inboxes naming their
  origin, a message republished by hand through the management API producing no second decision, and
  the replica channel keeping the Post's stream complete on the other side.

## Decisões que valem comentar

**O `EventBus` é o emitter.** Não há `PubSub` do `graphql-subscriptions`, não há `Subject` novo, não há `@EventsHandler` que "emite" para as subscriptions. `ObservableBus` estende `Observable`, e `ofType` é o operador que o próprio @nestjs/cqrs exporta para as sagas. Uma subscription GraphQL ouve o mesmo stream que a saga da tag padrão. Cada *stream* do `SubscriptionBus` é exatamente um `subscribe` no `Subject` — o e2e prova isso contando `eventBus.subject$.observers`.

**Subscription é uma mensagem própria, não uma query.** A primeira versão modelava subscription como query: `OnPostUpdatedSubscription extends Query<Observable<PostUpdatedEvent>>`, e o `QueryBus.execute` devolvia o `Observable` inteiro porque um `Observable` não é *thenable* — `await` de um não-thenable devolve ele mesmo. Funcionava, mas por acidente: o contrato dizia "uma resposta e acabou" (`Promise<T>`) enquanto o valor era "um stream que fica aberto". E `execute` não é o verbo de quem se inscreve.

Daí o `libs/cqsrs`: `Subscription<TEvent, TCriteria>`, `@SubscriptionHandler`, `ISubscriptionHandler` com `subscribe(): Observable<TEvent>` e um `SubscriptionBus` com a mesma anatomia do `QueryBus` (um `Map` de handlers por id de mensagem, um publisher, um explorer que varre os providers no bootstrap) mais o que só um stream precisa: um `Map` do que está no ar. Decidir quais eventos alimentam qual subscription continua sendo regra da aplicação; a interface só converte o stream para o transporte.

**Uma factory, não duas.** `CqsrsModule.forRootAsync` tem um problema que o `forRoot` não tem: as opções servem a dois módulos — o `CqsrsModule` (que só quer o `subscriptionPublisher`) e o `CqrsModule` embaixo (que quer todo o resto). O caminho ingênuo é passar as `CqsrsModuleAsyncOptions` para os dois, e aí a `useFactory` de quem chamou roda **duas vezes** — o que é no mínimo surpreendente, e no pior caso abre duas conexões. A saída é resolver as opções num módulo só (`CqsrsOptionsModule`, que as exporta pelo token `CQSRS_MODULE_OPTIONS`) e dar ao `CqrsModule.forRootAsync` uma factory que apenas repassa o que já foi resolvido. O mesmo objeto de módulo dinâmico entra nas duas listas de `imports`: o Nest identifica um módulo dinâmico pelo par (classe, metadata), então as duas referências são o mesmo módulo, com uma instância só. O `cqsrs.module.spec` trava isso contando as chamadas.

**The application's `EventPublisher`, and why a module's position decides it.** A handler that writes `constructor(private readonly publisher: EventPublisher)` should get the publisher this application commits through — here the transport one, so that `post.commit()` reaches the other service. `CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER })` is where that is said, and it is not a plain provider: `EventPublisher` already has one, in the `CqrsModule` this module re-exports, and two providers of one token mean whoever is consulted first answers. There are two lookup paths and they have different winners — a handler in the module that imports `CqsrsModule.forRoot(...)` resolves through that module's **exports**, in order; a handler anywhere else resolves through the **global** modules, in registration order. `AggregatePublisherModule` is therefore the same object in `imports` and in `exports`, before `CqrsModule` in both. Getting either order wrong does not throw: the handler receives Nest's plain publisher, `commit()` publishes locally, the events never leave, and nothing says so — which is why `cqsrs.module.spec` asserts the publisher a handler receives in both shapes, request-scoped included.

**O `SubscriptionBus` não é um `ObservableBus`.** Os três buses do @nestjs/cqrs *são* `Observable`s das mensagens que passam por eles. Este não pode ser: `ObservableBus` estende `Observable`, e `Observable` já tem um `subscribe` — que quer dizer outra coisa. Duas coisas diferentes não cabem no mesmo nome, e `subscribe(subscription)` é o método que dá sentido ao bus. O `Subject` continua lá, exposto como `subscriptions$` — mesmo stream, nome que não mente.

**A cola entre push e pull, e por que ela existe.** `observableToAsyncIterable` é o que separa o CQSRS do transporte: o bus fala RxJS, o graphql-js quer um async iterator. A primeira versão era um `ReadableStream` do Node (async-iterável por natureza, dez linhas) — e vazava assinantes: `ReadableStream`, `stream.Readable` e `async function*` **serializam `return()` atrás de um `next()` pendente**. Uma subscription GraphQL passa a vida esperando o próximo evento; quando o cliente desconecta, o graphql-js chama `return()`, que só resolveria no próximo evento. Até lá o assinante continuava vivo no `EventBus`. Um iterador com fila explícita resolve os `next()` pendentes com `done: true` na hora — é a mesma mecânica do `PubSubAsyncIterableIterator` do `graphql-subscriptions`, ligada a um `Observable` em vez de a um PubSub.

**O filtro é da mensagem, e o filtro é a chave.** `onPostUpdated(postId)` era o `filter` do `@Subscription` do @nestjs/graphql: o `Observable` era o mesmo para todos e o transporte peneirava por assinante. Agora o filtro é um método da própria mensagem, na camada de aplicação:

```ts
export class OnPostUpdatedSubscription extends Subscription<PostUpdatedEvent, { postId?: string | null }> {
  override filter(event: PostUpdatedEvent): boolean {
    return !this.criteria.postId || event.postId === this.criteria.postId;
  }
}
```

Uma subscription tem duas metades, e as duas são regra de aplicação: o **critério** (o dado — quais eventos interessam), que quem pede monta com os argumentos do protocolo, e o **filtro** (a regra — o que aquele critério quer dizer), que a aplicação escreve ao lado da mensagem. A interface diz *o quê*, a aplicação decide *como*, e o bus aplica sem saber nada do domínio: ele só chama `subscription.filter(event)`.

O ganho de ter isso na mensagem é o `key`: o critério serializado de forma estável **é** a identidade do pedido. Dois assinantes de `onPostUpdated(postId: X)` pedem literalmente a mesma coisa, então recebem o mesmo `Observable` — o filtro roda uma vez para os dois e o `EventBus` enxerga um assinante só. É a diferença entre O(assinantes) e O(critérios distintos) de trabalho por evento. O `share({ resetOnRefCountZero: true })` fecha o ciclo: quando o último assinante de um critério sai, a inscrição na fonte cai junto, e o mapa do que está no ar se limpa sozinho (`finalize` tira a entrada, `defer` a repõe se alguém reassinar).

`resolve: (payload) => payload` continua lá: diz ao graphql-js que o payload **é** o valor, em vez de procurar `payload.onPostUpdated`. E o resolver devolve um `AsyncIterableIterator` (iterator que também é iterable) porque um wrapper como o `withFilter` chama `next()`/`return()` direto no que o resolver devolveu, enquanto o graphql-js pede o `[Symbol.asyncIterator]()`.

**Por que Apollo, e não Mercurius.** A POC começou com Mercurius (Fastify), e tudo funcionava — inclusive o filtro, que na época era o do `@Subscription`. A diferença apareceu no desassinar: o `withFilter` do Mercurius é um `async function*` com `yield*`, e um async generator só processa `return()` depois que o `next()` pendente resolve. Um assinante filtrado que desconectava ficava pendurado no `EventBus` até o próximo `PostUpdatedEvent`. O `withFilter` do caminho Apollo é um iterador explícito; a inscrição cai na hora. Para uma POC sobre subscriptions, a limpeza imediata pesou mais que o Fastify.

**Uma classe por entidade, e o mapeamento do lado de fora.** `Post` é a entidade de domínio e o aggregate root do @nestjs/cqrs, numa classe só. O **mapeamento** não está mais junto: `PostSchema = defineEntity({ class: Post, … })` mora em `infrastructure/persistence/sqlite/entities/post-orm.entity`, com os outros `*-orm.entity`. Continua não existindo entidade espelho — o `defineEntity` aponta para *aquela* classe, e o que se separou foi a camada, não o objeto; o que o domínio ganhou é deixar de saber o tipo da coluna e o nome do índice. O único resquício do ORM que atravessa é herdar de `BaseEntity`, que é o preço de entrada do MikroORM. A base é `AggregateEntity = WithAggregateRoot(BaseEntity)`: a entidade já precisa herdar do `BaseEntity` do ORM, então `extends AggregateRoot` não serve — é exatamente o cenário para o qual o mixin existe. Uma constante compartilhada, e não um `WithAggregateRoot(...)` por entidade, porque o MikroORM descobre a classe-pai de cada entidade como entidade abstrata, e duas classes anônimas de nome `AggregateRoot` seriam ambíguas para ele. (Tentei antes `class Post extends WithAggregateRoot(PostSchema.class)` com `setClass`: a classe intermediária do mixin entra na cadeia de protótipos e a descoberta do ORM entra em loop — `Post extends AggregateRoot extends Post`.)

**`forceConstructor: true`.** O MikroORM hidrata entidades por `Object.create(prototype)`, sem chamar o construtor — e é no construtor que o mixin inicializa a lista de eventos não-commitados. Sem isso, um `post.apply(...)` numa entidade carregada do banco explode. Com `forceConstructor` no schema, um Post que volta do banco nasce pelo `new` e chega inteiro; o `create-post.command.spec` confere que ele volta com `getUncommittedEvents()` vazio.

**Um fork do EntityManager por command.** `@CreateRequestContext()` em todo command handler. Sem ele, um command despachado pela saga herda (pelo `AsyncLocalStorage`) o contexto da request HTTP que publicou o evento, e dois fluxos concorrentes dividem o mesmo identity map — o post que a mutation lê de volta e o que a saga está mutando seriam o mesmo objeto. É **metade** do `ProcessingContext` por command do Axon — a transacional —, dita com a ferramenta do ORM; a outra metade, a identidade do pedido, é o bloco acima. As queries usam `@EnsureRequestContext()`: rodam no contexto da request quando há um, e criam o seu quando não há (teste, WebSocket). O preço é o handler receber `EntityManager` no construtor só para o decorator achar `this.em`.

**Uma fatia, um arquivo — a mensagem e o handler dentro de um `namespace`.** Command, query e subscription moram no mesmo arquivo do handler que os trata, sob um `namespace` de mesmo nome do arquivo:

```ts
// application/post/command/assign-tag-to-post.command.ts — não existe mais um .handler.ts ao lado
export namespace AssignTagToPostCommand {
  export class AssignTagToPost extends Command<void> {
    constructor(readonly postId: PostId, readonly tagId: TagId) { super(); }
  }

  @CommandHandler(AssignTagToPost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<AssignTagToPost> { /* ... */ }
}

// quem despacha                                    // quem registra (app.module)
new AssignTagToPostCommand.AssignTagToPost(id, tag) // AssignTagToPostCommand.Handler
```

O par mensagem/handler é o que menos se separa nesta arquitetura — mudar o que um command carrega é mudar quem o trata, sempre —, e dois arquivos por caso de uso só faziam o leitor saltar entre eles. É o mesmo agrupamento dos `Command`/`Handler` aninhados do MediatR, com a ferramenta que o TypeScript tem para isso. O namespace ainda deixa o handler ter um nome curto sem perder contexto: `Handler` diz tudo quando o namespace já disse de quem, e o `applicationProviders` vira um índice dos casos de uso (`CreatePostCommand.Handler`, `FindPostQuery.Handler`, `OnPostUpdatedSubscription.Handler`).

Duas notas de quem implementou. A primeira: o namespace **não** pode declarar um membro chamado `Command` ou `Query` — o nome sombrearia o import do @nestjs/cqrs dentro dele e a classe herdaria de si mesma (`TS2506`); daí `CreatePostCommand.CreatePost` e não `CreatePost.Command`. A segunda é o preço: em runtime todos os handlers se chamam `Handler`, então um erro de injeção do Nest sai como *"can't resolve dependencies of the Handler (?)"* sem dizer qual — a dependência que faltou e o arquivo do stack trace continuam lá, mas o nome da classe deixou de ajudar. (Declarar a classe com nome descritivo e reexportá-la como `Handler` resolveria; o SWC não aceita `export { X as Y }` dentro de um namespace.)

**Uma request, uma cadeia — e a chave é o `PostId`.** O fork do EntityManager resolve a metade *transacional* do `ProcessingContext` do Axon; a outra metade é a **identidade** do pedido, e essa é o [request scoping/propagation](https://docs.nestjs.com/recipes/cqrs#request-scoping) do @nestjs/cqrs. Na versão Java, `@TargetEntityId PostId postId` no command roteava para o stream e `@EventTag` marcava os eventos com o mesmo id: uma chave gerada na borda (`PostId.newId()`) atravessava o pedido inteiro e amarrava os fatos uns aos outros. Aqui a chave é a mesma — o `PostId` que o mapeamento `CreatePostInput → CreatePost` gera —, e quem a carrega é uma `PostRequest extends AsyncContext`:

```ts
// a borda cria a request; a chave é o id do command
await this.commandBus.execute(command, new PostRequest(command.postId));

// o handler é resolvido no ContextId dela, e a repassa aos eventos
@CommandHandler(CreatePostCommand, { scope: Scope.REQUEST })
export class CreatePostCommandHandler {
  constructor(..., @Inject(REQUEST) private readonly request: AsyncContext) {}
  // publisher.mergeObjectContext(post, this.request) → o EventBus carimba cada evento
}

// a saga recebe a request de volta pelo evento, e a leva aos commands que despacha
const request = PostRequest.of(event) ?? new PostRequest(PostId.parse(event.postId));
await this.commandBus.execute(new CreateTagCommand(tagId, DEFAULT_TAG_NAME), request);
request.attachTo(new AssignTagToPostCommand(request.postId, tagId));
```

O `AsyncContext` é duas coisas ao mesmo tempo, e as duas importam: um **`ContextId` do Nest** (os buses o registram com `registerRequestByContextId` antes de resolver o handler, então `@Inject(REQUEST)` entrega *aquele* objeto) e um **carimbo na mensagem** (`attachTo` define uma propriedade não-enumerável, sob um símbolo, no próprio command ou evento). O segundo ponto é o que mantém a chave como **metadado, e não payload**: o evento continua sendo primitivos e estado resultante, contrato que atravessa processo, e o `PostId` como value object anda por fora — a distinção do Axon entre o payload e a `MetaData` de correlação. Sendo não-enumerável, o carimbo nem aparece no `toEqual` de um evento.

O ganho concreto está na saga: ela deixa de reconstruir a identidade do post do primitivo do evento (`PostId.parse(event.postId)`) e passa a **receber** o value object que a borda gerou — o `parse` sobra como fallback, para um evento sem request (um replay, um teste que alimenta a saga direto). E a propagação atravessa agregado: o `CreateTagCommandHandler` roda na request do *post* que pediu a tag, então o `TagCreatedEvent` nasce na mesma cadeia que o `PostCreatedEvent` e o `PostUpdatedEvent`.

As queries ficam de fora de propósito: uma leitura não abre cadeia causal, e o contexto de que ela precisa é o do ORM (`@EnsureRequestContext`). Os handlers de command tipam a request pela base `AsyncContext`, não por `PostRequest` — um command handler *propaga* o contexto, não o interpreta; quem lê o `postId` é a saga, e um command despachado sem request (um `commandBus.execute` de uma linha) chega com o contexto anônimo que o próprio `CommandBus` cria.

**Salvar, depois publicar.** `await this.posts.save(post); post.commit();` — nessa ordem. O `flush` é a transação; `commit()` publica no `EventBus` depois que ela fechou. Quem ouve (saga, subscriptions) só é avisado quando o post já está no banco — o "emit sai depois do commit" do Axon.

**Consistência eventual, de verdade.** No Axon, `context.onAfterCommit(...)` devolvia um `CompletableFuture` e o framework **esperava** por ele antes de completar o `send` — por isso a mutation devolvia o post já com a tag. O `EventBus` do Nest publica e segue; a saga roda depois, na sua própria unidade de trabalho. `createPost` devolve o post como nasceu (v1, sem tags) e o cliente vê a tag chegar pelo `onPostUpdated` — que é a ordem em que os fatos aconteceram. O e2e trata isso como comportamento, não como flakiness: assina antes de criar e espera o evento.

**A saga serializa e sobrevive.** `concatMap` (não `mergeMap`) em `AssignDefaultTagOnPostCreated`: dois posts criados ao mesmo tempo não disputam a criação da tag `Untagged`. E `catchError` **por evento**: o `EventBus` do @nestjs/cqrs faz `catchError(... return of())` no stream da saga inteira — um erro não tratado completa o stream, e nenhum post futuro ganharia tag. O teste `survives a failure on one post` derruba o `findByName` uma vez e confere que o post seguinte é servido.

**Value objects como classes, e não como tipos.** `PostTitle`, `PostId`, `Email` e companhia são classes geradas por `ValidatedDto.Scalar(schema)` — o `@Embeddable record` do Java, com um schema Zod no lugar do construtor canônico. A regra continua num lugar só (o schema, dentro da classe); o que a classe acrescenta é o resto do que um value object é: `toString`/`toJSON`/`valueOf`/`Symbol.toPrimitive` (o value object *é* o valor onde um valor é esperado — inclusive para os scalars do graphql-js, que serializam chamando `valueOf`), `equals` por valor **e por família** (um `TagId` nunca é igual a um `PostId` de mesmo texto), `parse`/`safeParse`/`is`, e `narrow(t => t.max(40))` para especializar sem repetir a `brand`. Só o `parse` produz um a partir de texto de fora, então um `PostTitle` que existe continua sendo sempre válido. `Post.create` valida os dois de uma vez (`z.object({ title: PostTitle.field(), content: PostContent.field() })`, que já devolve os value objects prontos) e traduz o `ZodError` em `InvalidPostException` com `z.prettifyError`.

**E eles vão até a coluna.** `Post.id` é um `PostId` de verdade, chave primária inclusive. Quem faz a travessia é o `valueObjectType`: um `Type` do MikroORM gerado a partir da própria classe, que escreve o valor cru, hidrata a classe de volta, serializa o cursor de paginação como texto e o **valida** na volta (`fromJSON`) — um cursor forjado vira `CursorError`, e não um id impossível. O DDL não mudou uma linha (`varchar(36)`, `varchar(200)`, `text`), consultar aceita os dois lados (`em.findOne(Post, { id })` com o value object ou com o texto), e hidratar **não** revalida: é a mesma escolha de sempre, e é por isso que `PostId.wrap` existe ao lado de `PostId.parse`.

**O que os eventos carregam continua primitivo.** `PostCreatedEvent` guarda `string`, e não `PostTitle` — um evento é um fato que atravessa processo, e é isso que deixa a subscription `onPostUpdated` montar a `PostView` do payload sem tocar o banco dentro de um WebSocket. A conversão mora exatamente na fronteira que o `decidir → evoluir` já tinha: decidir escreve `title.value` no evento, evoluir faz `PostTitle.parse(event.title)` de volta — então a invariante roda também no replay. O `post-request.spec` trava os dois lados: o payload primitivo, e o `PostId` como value object viajando **por fora**, como metadado.

**Soft delete: um embeddable, um mixin, um filtro e um subscriber.** É a tradução peça a peça da versão Java, e as duas primeiras têm lá o mesmo nome. O **`SoftDeletion`** é o `@Embeddable`: o instante em que foi apagado (`null` = vivo), com `isDeleted`/`at()` e um `toString` que diz "vivo" ou "apagado em …". O **`WithSoftDelete`** é o `interface SoftDeletable` com métodos default: quem herda dá `identity()` e ganha o estado, as perguntas e **dois pares** de transição. `softDelete`/`restore` **decidem**: recusam quando não há fato novo (`AlreadyDeletedException`, `NotDeletedException`, as duas compartilhadas em `domain/shared`) — e são também o ponto de extensão, porque o agregado que precisa registrar o fato **sobrescreve** e chama `super` antes de disparar o evento, que é o que garante a guarda rodando antes de existir evento. (Em Java isso é uma sobrecarga; aqui é uma sobrescrita, mesma relação.) `applyDeletion`/`applyRestoration` **evoluem**: aplicam um fato já acontecido sem verificar nada. A distinção é a mesma de `decidir → evoluir` e não é estética: o mesmo `PostDeletedEvent` é aplicado duas vezes (ao decidir, e de novo ao reconstituir), e um handler `on<Evento>` que chamasse a versão que decide estouraria na segunda. E o **filtro `active`** é o `@SQLRestriction(ALIVE)`, dito com a ferramenta que o MikroORM recomenda para soft delete: viaja no `defineEntity` de cada agregado (do lado da infraestrutura, com o resto do mapeamento) com `default: true`, então toda consulta já nasce filtrada e quem precisar do apagado pede (`{ filters: { active: false } }`). Foi ele que deixou o repositório de User parar de repetir `deletedAt: null` à mão.

A tradução das anotações é peça a peça: `@SQLRestriction` vira o **filtro** e `@SQLDelete` vira o **subscriber** — as duas metades que o MikroORM oferece para soft delete, e uma sem a outra deixa um buraco, porque o filtro esconderia o que um `em.remove` teria apagado de verdade. O subscriber reclassifica o changeset de `DELETE` para `UPDATE` no `onFlush`, e a diferença em relação ao Java é a seu favor: lá o `Author` precisou de um `@SQLDelete` **próprio** porque numa herança `JOINED` o Hibernate emite um DELETE por tabela, e sem ele a linha de `authors` sumia de verdade enquanto a de `users` só era marcada — o autor voltaria de um restore como se fosse leitor. Aqui o changeset da entidade concreta carrega os das tabelas-pai (`tptChangeSets`), então reclassificar o de cima cobre a hierarquia inteira, e o mixin vale para qualquer entidade que o herde em vez de precisar de anotação por classe. O `user-soft-delete.spec` prova as duas coisas contra o banco, e desligar o subscriber quebra três dos cinco testes dele.

`PostRepository.restore(id)` e `UserRepository.restore(id)` existem como lá, e pelo mesmo desconforto: enquanto a linha está marcada, o filtro a esconde até do `findById`, então restaurar precisa de uma escrita que passe por fora (`nativeUpdate` com `active: false`). A razão exata difere — lá o que quebra é o SELECT que o `merge` do JPA faz por dentro; aqui o unit of work atualiza pela chave primária sem SELECT, então carregar com o filtro desligado e dar `flush` também funciona, e o `soft-delete.spec` cobre esse caminho.

Uma coisa diverge, e por diferença de linguagem: **o par que decide se chama `softDelete`/`restore`, e não `delete`/`restore`.** Em Java o agregado *sobrecarrega* aqueles nomes; aqui ele os **sobrescreve** e chama `super`, o que só funciona com uma assinatura só — daí o `softDelete`, que é como o resto do projeto já chamava a operação.

O `SoftDeletion` é **mutável**, como o de lá, e pelo mesmo motivo: é o pedaço de estado que o ORM gerencia e que as transições do mixin alteram — a mesma razão por que as entidades têm campos não-finais. A diferença é que a disciplina não é garantida: em Java a mutação fica trancada por visibilidade de pacote, e TypeScript não tem equivalente. O que existe é a convenção de que só `applyDeletion`/`applyRestoration` escrevem ali.

Uma armadilha do Java que aqui não existe, e o teste prova: o Hibernate deixa o `@Embedded` **nulo** quando todas as colunas dele vêm nulas — que é o caso de toda entidade viva —, e por isso o `Post.softDeletion()` de lá reinstancia o holder na leitura. Com `forceConstructor: true`, o MikroORM hidrata pelo `new` e o inicializador do campo roda antes de qualquer coluna ser atribuída. É a mesma flag que já estava lá por causa da `Collection` de tags.

O efeito que este README chamava de indireto passou a ser verdade junto: apagar um autor tira **os posts dele** das consultas sem tocar em nenhuma linha de post. Quem faz isso é o `autoJoinRefsForFilters` do MikroORM (ligado por padrão), que junta a relação m:1 quando ela tem filtro. Desde que o post passou a apontar para a linha delegada, a corrente tem um elo a mais — `posts → authors → users` —, e `authors` não tem `deleted_at` nenhum para filtrar: o filtro dela é `activeThrough('user')`, uma condição sobre a relação. Sem esse elo a cascata se parte no meio em silêncio, que foi exatamente como o `soft-delete-filter.spec` a pegou — ele confere a cascata inteira, inclusive que a linha do post continua com `deleted_at` nulo.

**Só um Author escreve, e o upcast é um parâmetro.** `Post.create` recebe `Ref<Authorship>`, não `Ref<User>`: quem não tem a linha delegada não é rejeitado por um `if`, ele simplesmente não cabe na assinatura. A triagem acontece **uma vez**, e nem sequer dentro do resolver: `@CurrentAuthor()` é o `@Session()` da lib de auth **composto com dois pipes** — `SessionUserPipe` (que tem o `UserProvisioning` injetado) traduz a sessão no perfil de domínio, e `AuthorPipe` exige o papel e pede o `Author` à porta, que só o devolve se a linha em `authors` existir — as duas condições, com a mesma recusa. O resolver não tem guarda escrita à mão, e também **não consegue esquecê-la**: o que ele declara é o tipo que ela produz.

É a composição do próprio Nest — um parâmetro aceita vários pipes, aplicados em ordem, e a saída de um alimenta o seguinte (`sessão → User → Author`). Um pipe, e não o corpo de um `createParamDecorator`, porque a factory de um param decorator recebe só o `ExecutionContext` e não participa da injeção de dependência: ela nunca alcançaria o `UserProvisioning`. Cada peça faz uma coisa e é testável sozinha — o que antes era um `requireAuthor` privado, testável só subindo um resolver, virou duas classes com spec próprio.

**O provedor de identidade entrou por uma porta.** O `UserProvisioning` não conhece o Better Auth: ele conhece o `IdentityProvider`, uma `abstract class` em `domain/user` com dois métodos — `findById(credentialId)` e `grantRole(credentialId, role)`. Quem sabe o nome do provedor é um adapter só, o `BetterAuthIdentityProvider`, e trocar o Better Auth por Keycloak (que é de onde este projeto veio) é escrever outro adapter e mudar uma linha do `IdentityModule`. Nada em `application/` muda — e o `user-provisioning.service.spec` inteiro roda contra um `FakeIdentityProvider` que cabe em 50 linhas, sem subir servidor de autenticação nenhum.

O adapter fala com o `internalAdapter` do `auth.$context`, e não com o `auth.api`. Não é conveniência: o `auth.api` é a superfície **HTTP**, e os endpoints de administração (`setRole`) exigem uma sessão de admin — aqui quem chama é o servidor, sobre si mesmo. O `internalAdapter` é a camada que aqueles endpoints usam por dentro, e tem a propriedade que decide a escolha: `updateUser` passa pelo `updateWithHooks`, então **conceder um papel dispara o hook de `user.update`**. O caminho da promoção é um só, venha ela da API ou de dentro.

**O que o provisionamento parou de perguntar: conta.** A versão Java tem um `Account` no domínio, com tabela própria, ligando credencial a perfil. Aqui não tem, e é de propósito: o Better Auth já faz isso — `account.accountLinking` prende a credencial nova do Google à identidade de quem já tinha senha, e o que chega à porta é **uma** identidade, com **um** email. Espelhar aquelas linhas criaria uma segunda verdade para manter em sincronia sem responder nada que o email já não respondesse; é o mesmo motivo pelo qual não existe um `PostEntity` ao lado do `Post`. A separação entre *user* e *account* continua existindo — ela mora inteira do lado de lá.

**Provisionar deixou de ser efeito colateral de uma query.** Enquanto o perfil nascia no `SessionUserPipe`, "existir no domínio" era consequência de ler um post: quem se registrasse e nunca fizesse uma query simplesmente não existia. Agora o gatilho é o fato: `@AfterCreate('user')` provisiona no sign-up, `@AfterUpdate('user')` promove quando o papel muda. São *database hooks* do Better Auth, descobertos pelo `@DatabaseHook()` do @thallesp/nestjs-better-auth, e moram em `interfaces/auth` porque são a mesma natureza de um resolver — algo de fora chamando a aplicação, só que com uma linha gravada no lugar de uma query.

Duas armadilhas, as duas custaram teste:

- o `setupDatabaseHooks` da lib começa com `if (!auth.options.databaseHooks) return`. Sem um `databaseHooks: {}` nas `authOptions`, os ganchos são registrados como providers, descobertos pelo `DiscoveryService`… e nunca chamados. É o pior modo de uma integração falhar, e por isso a linha tem um comentário do tamanho dela;
- um hook roda dentro da requisição de `/api/auth/*`, que já tem contexto do ORM — mas `grantRole` chama o Better Auth **de dentro do servidor**, sem requisição nenhuma, e `allowGlobalContext: false` recusaria a primeira consulta. `inRequestContext` reaproveita o contexto quando há um e abre um quando não há; é o que faz o hook enxergar o que a chamada que o disparou acabou de gravar.

O pipe continua chamando `provision` a cada requisição, e é de propósito que ele não sumiu: o método é idempotente (com o perfil já lá, provisionar é uma leitura), e ele é a **retaguarda** para uma identidade que tenha nascido por um caminho que não passou pelo hook. Falhar ao provisionar não derruba o sign-up — autenticar é do provedor, provisionar é nosso, e a requisição seguinte refaz o trabalho.

O e2e é onde isso vira verificação: ele mede quantos perfis existem **entre** o sign-up e a concessão do papel (um, criado pelo hook, antes de qualquer query), e promove chamando `identities.grantRole(...)`. Antes essa linha era um `nativeUpdate` na tabela `authUser` — que atalhava o Better Auth inteiro e portanto não exercitava hook nenhum.

**Uma pegadinha que só o e2e pega.** A factory do `@Session()` é `async`, e o Nest **não a resolve antes de aplicar os pipes**: no `ExternalContextCreator`, `const value = extractValue(...)` não é awaited, e o `await` que existe só resolve a Promise quando **não** há pipe. Com pipe, quem recebe a Promise é o primeiro da cadeia — daí o `await` no `SessionUserPipe`. Do segundo em diante o `PipesConsumer` já resolve entre um e outro. Há um teste para isso, mas foi o e2e que o encontrou.

**E por isso o command handler não relê o autor.** Quando o `authorId` chega lá, ele já passou por todo o processo de saber que é de um autor; o que falta é só a referência que a coluna guarda, e `delegateRef(Author, id)` a produz sem consulta nenhuma. O handler perdeu o `UserRepository` inteiro. Quem garante que aquele id existe **e é de um autor** é a chave estrangeira `posts.author_id → authors.id` — que não aceita quem não tem a linha delegada nem por acidente de dados, e que garante **melhor** do que a consulta garantia: um SELECT antes do INSERT tem uma janela em que o autor pode sumir, e a restrição não tem.

A checagem que saiu tinha ainda um segundo defeito, e é o que decide a questão: ela distinguia "não existe" de "é leitor", e isso é um **oráculo de quais usuários existem**. A FK não distingue, e a mensagem traduzida também não — `NotAnAuthorException` sem id diz apenas "o autor informado não existe ou não pode escrever". A versão com id existe e é usada só na borda, onde quem recebe a mensagem é o próprio dono da sessão.

**Confiar na restrição exige traduzi-la.** Sem tradução, uma FK recusada chegaria ao cliente como `INTERNAL_SERVER_ERROR` com uma mensagem de driver, e ninguém trocaria uma checagem legível por isso. O `MikroOrmExceptionFilter` faz a ponte — FK → `BAD_USER_INPUT` com a mensagem vaga, unique → `CONFLICT`, `NotFoundError` → `NOT_FOUND`, e o resto sobe como está, porque um erro de driver que ele não reconhece é bug ou indisponibilidade e mascará-lo seria pior. Ele é aplicado com `@UseFilters` **no resolver que escreve**, e não globalmente: é lá que uma violação de integridade é uma resposta possível ao que o cliente pediu.

O que o command carrega, então, é o **retrato** do autor: o id, que vira a referência, e o nome, que é o que o `PostCreatedEvent` registra para a subscription montar a `PostView` sem tocar o banco. (Na versão Java o evento não leva o nome — lá o `Post.author` do GraphQL é resolvido por DataLoader. É a única coisa que ainda mantém um campo a mais no command deste lado.)

**O papel deixou de ser uma classe, e promover deixou de abrir outro stream.** A versão anterior tinha herança multi-tabela: `Reader` e `Author` eram subclasses de uma raiz abstrata, e o papel de alguém *era* a classe que o ORM instanciava ao ler. Isso funciona enquanto ninguém muda de papel — e a classe de uma linha não muda. Promover um leitor virava, então, **encerrar um stream e abrir outro**: `supersede(novoId)`, `superseded_by` apontando para o sucessor, `supersedes` apontando de volta, `saveAll([author, reader])` numa transação só para a FK não recusar, e um `pendingPromotionId` para retomar a promoção que morresse no meio. Três colunas, dois eventos, uma identidade nova e um caminho de recuperação — tudo para contornar o fato de que `UPDATE users SET class = …` não existe.

O que substituiu isso cabe numa frase: **o user é um só, e a capacidade é uma linha ao lado.** `users` é concreto e carrega `roles`. `authors` continua existindo, com a mesma chave primária e a mesma chave estrangeira, mas deixou de ser a tabela filha da herança e passou a ser a **linha delegada** — a que carrega o que só um autor tem, que é a coleção de posts. Promover é `grantRole(AUTHOR_ROLE)` no mesmo agregado (um evento a mais no mesmo stream) e um `INSERT` em `authors`. O id não muda, a sessão não muda, e nada precisa apontar para nada: `supersededBy`, `supersedes`, `UserSupersededEvent`, `findSupersededBy`, `findSupersededByEmail`, `Reader` e o `pendingPromotionId` saíram todos. O e2e afirma o que ficou — conceder o papel pela porta não cria um segundo perfil.

**O cast é composição, e continua sendo um tipo.** O que o resto do código recebe não é um `User` com um `if` de papel: é um `Author`, e `Author` é um tipo de verdade, produzido pelo mixin genérico de `domain/shared/delegation`:

```ts
export const Author = Delegate(User, {
  name: 'Author',
  to: Authorship,          // a entidade delegada: a linha em `authors`
  as: 'authorship',        // por onde ela fica pendurada no user castado
  from: 'user',            // e por onde se volta dela para o user
  forwarding: ['posted', 'postCount', 'wrote'],
});
export type Author = InstanceType<typeof Author>;
```

`Delegate` devolve uma classe que estende `User` e encaminha aqueles três membros para o delegado — e falha **na construção do mixin**, não na chamada, se o delegado não declarar algum deles. `Author.cast(user, authorship)` troca o protótipo **do próprio objeto** e pendura o delegado numa propriedade não-enumerável: `cast(user, …) === user`. O user continua gerenciado pelo ORM, continua no identity map, e um `flush` depois do cast grava o que gravaria antes. É o que separa isto de um wrapper: um wrapper seria outro objeto, e a entidade gerenciada ficaria para trás.

Trocar o protótipo de uma entidade gerenciada cobra duas linhas, e as duas apareceram como teste vermelho antes de aparecerem como decisão:

- **o `constructor` do protótipo continua apontando para `User`.** O `ChangeSetComputer` do MikroORM resolve metadata por `entity.constructor`, e sem esse cuidado o primeiro `flush` depois de um cast morre com `Metadata for entity Author not found` — foi assim que o e2e o pegou, e não o typecheck. Para o ORM o cast não aconteceu, e está certo assim: a linha é a mesma;
- **`BaseEntity.equals` deixou de comparar `constructor` por identidade.** Compara se um é instância da classe do outro, nos dois sentidos. Senão um `User` relido e o mesmo user castado deixariam de ser iguais — o contrário exato do que o cast significa.

**Quem materializa a delegação é o adapter, e não um serviço.** Houve aqui um `UserDelegations` — um registro `papel → { mixin, como carregar, como criar }` na camada de aplicação, com o `AuthorPipe` a pedir-lhe o cast. Ele saiu, e o que o substituiu é uma porta que devolve a coisa certa:

```ts
export abstract class AuthorRepository {
  abstract findById(userId: UserId): Promise<Author | null>;
  abstract create(user: User): Promise<Author>;
}
```

O `MikroOrmAuthorRepository` é quem sabe montar um `Author`: encontra a linha em `authors`, chama `delegated(...)` e devolve o **mesmo** `User` do identity map, agora castado — há um teste que afirma exatamente esse `toBe`. O `inRequestContext` vive ali, que é onde tem de estar: um cast pedido por um field resolver dentro de uma subscription roda fora do middleware do Express, e sem esse envelope o `allowGlobalContext: false` recusa a primeira consulta.

O que a porta **não** pode fazer é inventar uma referência: quem parte de um `User` de sessão, ou de um `authorId` que veio numa `PostView`, não tem ref nenhuma em mãos e paga uma consulta. Seguir o ref só é possível onde ele existe — e é por isso que o `Post.author` tem `loadDelegated()` e o `AuthorPipe` não.

A `user.entity.ts` continua sem citar `Author` em lugar nenhum: quem faz a ponte papel → capacidade é o `AUTHOR_ROLE`, que mora em `author.entity.ts` junto de quem lhe dá significado, e o `UserProvisioning`, que é quem já traduz o que o provedor de identidade diz. Com um segundo papel, o registro volta — `Delegate` continua a compor (`delegation.over(base)` memoriza a classe por base, e dois delegados cabem num `setPrototypeOf` só, o que o `delegate.spec` afirma). Enquanto há um, um registro para uma entrada é peso morto.

**Reconstituir continua sendo `new User()` + `loadFromHistory(...)`**, e `register` voltou a ser um construtor nomeado comum: o `this: new () => T`, que existia para impedir `User.register(...)` numa raiz abstrata, saiu junto com a raiz abstrata. O `role` do `UserRegisteredEvent` virou `roles` e continua sendo **retrato** — o que aquela pessoa tinha quando nasceu —, com o `UserRoleGrantedEvent` a registar o que mudou depois.

**A referência diz para onde aponta e no que resolve.** `Post.author` não é `Ref<Authorship>`: é `DelegatedRef<Authorship, Author>` — a linha que a coluna guarda **e** o tipo em que ela vira quando alguém a quiser usar. O par de helpers fecha o ciclo nos dois sentidos:

```ts
post.author = delegateRef(Author, authorId);   // de um id (ou da própria Authorship) para a referência
post.author.id;                                // o id, sem carregar coisa nenhuma
post.author.delegated();                       // da referência carregada para o Author, já castado
await post.author.loadDelegated();             // ... e da que ainda não foi carregada (null se não há linha)
```

Repare que só há **uma** função livre: `delegateRef`, que constrói. Resolver é da própria referência — houve aqui um par de helpers livres (`delegated(ref)` e `loadDelegated(ref)`), e eles eram a mesma verruga do `authorId`: uma função a fazer o que o objeto em mãos já devia saber fazer.

`delegateRef` é o `ref(rel(...))` do MikroORM com o tipo certo na saída. `delegated` é o caminho de volta: desembrulha a referência, encontra a delegação pelo delegado (é para isso que `Delegate` mantém o registro `delegado → delegação`), segue o `from` até o sujeito e devolve o cast — sem que o chamador escreva `getEntity()` duas vezes nem cite `Authorship`. `Post.authorName()` é uma linha, e o `equals` do cast é o que torna `delegated(...)` idempotente: resolver duas vezes devolve o mesmo objeto.

**E a referência entrega o id, porque é o mesmo id.** A chave primária de `Authorship` é a *relação* com o user (`[PrimaryKeyProp]?: 'user'`, coluna `id`), e um `Reference` do MikroORM define getters só para as **chaves primárias** — pelo que `post.author.id` nasceu `undefined`. Houve aqui um getter `Post.authorId` a contornar isso, e ele era exatamente o tipo de coisa que este desenho existe para não ter: um id solto a viajar ao lado de uma referência que já o contém.

O que o substituiu está em `infrastructure/persistence/sqlite/delegation`, e é o mesmo gesto que dá à referência os outros dois métodos:

```ts
Object.defineProperty(Reference.prototype, "id", {
  get() {
    const entity = this.unwrap();
    return delegationOf(entity.constructor) ? entity.id : undefined;
  },
});
```

Funciona por causa de uma regra da linguagem, e não de um truque: o construtor do `Reference` define os getters das chaves primárias **na instância**, e uma propriedade própria vence a do protótipo. Uma `Ref<Tag>` continua a devolver o `id` dela pelo getter que o MikroORM lhe pendurou; só as referências cuja PK **não** se chama `id` chegam ao protótipo — e dessas, só as que apontam para um delegado registado respondem. O `delegated-reference.spec` fixa os três casos, o `ref` não carregado inclusive: `Authorship.id` lê `this.user.id`, e o `user` é a PK, que está sempre lá.

Duas alternativas foram tentadas e deitadas fora: mapear `id` **e** `user` na mesma coluna é recusado pelo próprio MikroORM (`Duplicate fieldNames are not allowed`), e fazer de `id` a PK escalar com `user` em `persist: false` apaga a chave estrangeira `authors.id → users.id` do schema gerado — trocar uma restrição do banco por ergonomia é o oposto do que o resto deste ficheiro defende.

Por isso também a relação `Authorship.user` é `eager`: um autor sem o seu user é inútil, e uma linha de `authors` sem a de `users` não existe.

**`Author.posts`, e o convite que ela não aceita.** O `Author` da versão Java deliberadamente **não** tem esta coleção, e o javadoc diz por quê: "um autor produtivo tem milhares de posts, e uma coleção mapeada é um convite a carregar todos para responder qualquer coisa". O convite é real. A resposta aqui não foi abrir mão da coleção — foi não expor o que o aceita: não há `loadItems()` na `Authorship`, e os três métodos que ela oferece (os mesmos que o mixin encaminha) vão ao banco com `limit`/`count` ou não vão ao banco de todo. `posted({ limit, offset })` usa o `matching()` da própria coleção, `postCount()` é um `count(*)`, e `wrote(post)` compara ids. O `author.entity.spec` afirma isso diretamente: depois de paginar e de contar, `authorship.posts.isInitialized()` continua `false`.

**Tags como relação de verdade — e o que isso custou.** `Post.tags` é `Collection<Tag>`, um many-to-many com pivô `posts_tags`: o Post guarda o **agregado `Tag`**, não uma cópia de id + nome. A versão anterior usava um embeddable (`p.embedded(TagRef).array()`, uma coluna JSON na própria linha) pelo argumento clássico de DDD — agregado referencia agregado por identidade, e uma relação do ORM entre os dois abre cascatas e lazy loading atravessando a fronteira de consistência. A troca vale a pena por integridade referencial, por um rename de tag passar a aparecer nos posts, e por dar acesso ao `populate`/`dataloader` do ORM; e cobra três coisas que vale registrar.

**Primeiro: o ganho de dataloading é parcialmente circular.** Com as tags na linha não havia N+1 nenhum — N posts eram N linhas com as tags dentro. A relação *cria* o N+1 que o dataloader depois resolve. Na prática o caminho do GraphQL nem chega lá: o `MikroOrmPostRepository` popula (`populate: ['tags']`) no `findById` e no `findByCursor`, o que resolve tudo em uma consulta a mais. O `dataloader: DataloaderType.ALL` no config cobre o acesso preguiçoso que aparecer.

**Segundo: `decidir → evoluir` entra em atrito com a relação.** O evento carrega primitivos (`{ tagId, name }`) — isso não mudou, e é o que deixa a subscription `onPostUpdated` montar a `PostView` do payload sem tocar o banco dentro de um WebSocket. Mas de primitivos não se materializa um agregado: o evento devolve **ids**, e o `Tag` como objeto só existe se alguém o trouxe. Por isso `assignTag` põe a Tag na coleção **antes** de levantar o evento, e `onPostUpdatedEvent` remonta a lista reaproveitando o que a coleção já tem (`rel()` cobre só o que faltar). O evento continua mandando na participação — quem não estiver nele sai; os objetos apenas sobrevivem à travessia.

A saída que *parece* óbvia não funciona, e vale saber por quê: confiar no identity map. `EntityFactory.createReference` de fato consulta `unitOfWork.getById(...)` antes de fabricar um stub, mas aquele `unitOfWork` não é o da request — `rel()` chega ao factory por `entityType.prototype.__factory`, e o `EntityHelper.decorate` o prende, **uma vez, na descoberta**, a um `em.fork()` dedicado guardado como campo privado. Medido: dentro do mesmo fork que acabou de carregar a Tag, `em.getReference(Tag, id).name` é `'Untagged'` e `rel(Tag, id).name` é `undefined`. Um eager load no command não muda isso. O que resta como limitação é o replay puro (`loadFromHistory` num Post novo): os ids voltam, os nomes não — reidratá-los exige um EntityManager, que o domínio não tem.

**Terceiro: o domínio deixou de rodar sem o ORM.** Uma `Collection` descobre a que propriedade pertence lendo a metadata do dono (`Collection.property` → `wrap(owner).__meta`), então qualquer `add`/`set` numa entidade não descoberta estoura `MetadataError`. O `post.entity.spec` passou a inicializar um MikroORM só para a descoberta — sem `ensureDatabase`, sem tabela, sem leitura. Não há como evitar: `propagationOnPrototype: false` não serve, porque a flag é lida do config de um ORM **já inicializado** (`EntityHelper`) e não passa perto desse getter.

O `Post.tags(first, after)` do schema não mudou: o mapeamento `Post → PostView` achata a coleção populada para a `PostView` (por um `mapWith`, que delega ao `Tag → TagView`), e o `PostTagsResolver` continua recortando em memória. O schema é byte a byte o mesmo.

**Cursor connection montada pelo ORM.** `posts(first, after)` é `em.findByCursor(Post, { first, after, orderBy: { createdAt: 'asc', id: 'asc' } })`. O `Cursor` devolvido já traz `items`, `hasNextPage`, `startCursor`/`endCursor` e `from(entidade)` para o cursor de cada edge; o resolver só monta o shape. A ordenação é `createdAt, id` porque `createdAt` sozinho não é único. Os tipos `PostConnection`/`PostEdge`/`PageInfo` estão escritos no schema; do lado do TypeScript sobra `ConnectionType<T>`, um tipo genérico sem comportamento. As tags usam `Cursor.encode`/`Cursor.decode` do próprio MikroORM para os cursores, então as duas connections falam o mesmo dialeto.

**`me` devolve uma interface, e o upcast é do papel — não de uma claim.** `me: IUser!` é a única query polimórfica do schema, e a cadeia que a sustenta não tem um `if` de autorização em lugar nenhum: o `UserProvisioning` devolve o perfil que o ORM hidratou, o `UserViewInterceptor` despacha por `hasRole(AUTHOR_ROLE)` — lido do próprio agregado — entre os dois mapeamentos do `UserProfile` (`User → UserView` e `User → AuthorView`), e o `__resolveType` traduz a classe do DTO no nome do schema. O efeito é que `... on Author { posts }` **não casa** para quem não é autor, e a resposta sai sem o campo em vez de sair com uma lista vazia. O papel no cookie continua existindo e continua barrando cedo (`@Roles([AUTHOR_ROLE])` nas mutations), mas o que *aparece* numa resposta vem do que está gravado: não há flag a forjar.

Trocar herança por composição não mudou o que o cliente vê — mudou de onde o `__typename` vem. O tipo concreto era a classe que o ORM instanciava; agora é o papel que o user carrega, e os dois tipos do schema são duas leituras da **mesma** linha. O `Reader` saiu do schema junto com a classe; quem não é autor é `User`, que é o tipo concreto de quem não tem capacidade nenhuma pendurada. A interface passou a chamar-se `IUser` para o nome `User` ficar livre para ele.

**`Post.author` é um `Author`, e isso tornou o schema um grafo.** Era `author: String!` — o nome copiado para a `PostView` —, e um nome não é navegável: o protocolo parava ali. Agora a view carrega `authorId` e o campo é resolvido à parte, então `post → author → posts → author` fecha o ciclo. O `!` não é otimismo: a coluna `posts.author_id` aponta para `authors`, então a chave estrangeira já garante que o autor de um post tem a linha delegada — e é por isso que este campo usa um `MapInterceptor(User, AuthorView)` direto, sem o despacho polimórfico do `me`: aqui não há tipo a decidir em runtime.

A troca tem um custo, e ele não é o mesmo nos dois caminhos. Nas **leituras** é zero: o repositório já populava o autor junto do post, então ele está no identity map da requisição e a resolução não emite consulta — medido no driver, com um controle, no `find-author.query.spec`. Nas **subscriptions** é uma consulta por payload entregue, e isso é a parte interessante: a view de `onPostCreated` nasce do payload do evento justamente para não tocar o banco, e o evento carrega `authorId` **e** `authorName`, mas não e-mail — porque o e-mail de alguém não é um fato sobre um post. Quem pede `author` numa subscription está pedindo algo que não está no evento, e paga por isso; quem pede só `id title version` continua sem tocar o banco.

Isso trouxe um segundo efeito, que é o que faltava descobrir: a resolução de um campo disparado por subscription roda **fora** do middleware do Express, dentro do WebSocket, e portanto sem contexto do ORM — `allowGlobalContext: false` recusava a consulta e o cliente recebia `data: null`. A correção é o `inRequestContext` nas duas leituras que um resolver de campo alcança (`UserRepository.findById` e `PostRepository.findByAuthor`): havendo contexto, o envelope é inerte e o identity map continua o da requisição; não havendo, abre-se um. Qualquer leitura nova alcançável por um campo precisa do mesmo envelope — são duas hoje, e está dito nos dois lugares.

Uma consequência que ficou por decidir: o `authorName` dos eventos já **não é lido por ninguém**. Ele continua no payload porque um fato gravado não se reescreve por ter deixado de ser consultado, e porque é o que permitiria um dia dizer "o nome na época" — que é precisamente o que um `authorId` sozinho não diz. Tirá-lo é uma decisão à parte, e está anotada como tal no `Post.create`.

**`Author.posts` é uma consulta, não uma coleção.** O agregado tem `posted()`/`postCount()` e eles seguem sendo a resposta para perguntas de domínio — mas o campo do schema passa pela porta (`PostRepository.findByAuthor`) por uma razão específica: `populate` é preço da referência sobre a cópia, e esse preço é cobrado na borda da persistência, não no domínio. Um `Author.posted()` que soubesse que a `PostView` quer `tags` teria virado read model. De quebra, os dois lados ganham o mesmo keyset do `em.findByCursor` — a ordem é que difere (`Query.posts` é crescente por criação, `Author.posts` decrescente). As duas ordenam pelas mesmas chaves, então um cursor de uma lista **decodifica** na outra sem ser recusado: ele passa a significar o lado oposto da comparação, e a página que sai é outra (normalmente vazia). Não é um problema a resolver — um cursor é opaco por contrato, e quem o tira de uma lista o devolve na mesma —, mas é a razão de não existir atalho entre as duas: são listas diferentes, não duas vistas da mesma.

**O `pageInfo` nunca é recalculado por um resolver.** Com duas connections servidas por cursor, a conta de `hasNextPage` existiria em dois lugares — e uma paginação que mente é um bug que não aparece em nenhum teste de campo. O `connectionOf` é a única peça que lê o `Cursor` do MikroORM, e o que sobra para quem chama é só o que é dele: como um item vira nó do protocolo. É o `Connections` da versão Java, pelo mesmo motivo.

**Portas como classes abstratas.** `PostRepository` e `TagRepository` são `abstract class`, não `interface`: no Nest a classe é ao mesmo tempo o contrato e o token de injeção (`{ provide: PostRepository, useClass: MikroOrmPostRepository }`), sem `@Inject('TOKEN')`.

**Uma altura de validação — mesmo com value objects na borda.** A versão Java validava na borda (Bean Validation) e no domínio. Aqui só o domínio valida, e isso não mudou quando `CreatePostInput` passou a declarar `title: PostTitle`: o construtor de um value object gerado **não lança** — ele normaliza pelo schema e, se o valor for inválido, guarda o valor cru para quem quiser perguntar (`isValid()`, ou o `class-validator`). Um título em branco continua atravessando a borda e sendo rejeitado pelo domínio, e o `DomainExceptionFilter` o entrega ao cliente como `BAD_USER_INPUT` com a mensagem do value object. A única exceção continua sendo a mesma de antes, agora escrita como `id.assertValid()` num `forMember` do `PostProfile` — um id que não é UUID nem vira command. Quando ela dispara, o AutoMapper embrulha a falha num `MapMemberError`, e o `DomainExceptionFilter` a descasca de volta para o erro de domínio: o cliente continua recebendo `BAD_USER_INPUT` com a mensagem do value object, e não um 500 falando do mapeador.

**Exception filter que devolve, não escreve.** Num resolver GraphQL, um `ExceptionFilter` não escreve resposta: **devolve** o erro, e o @nestjs/graphql o lança de volta para o graphql-js, que o coloca em `errors[]`. `includeStacktraceInErrorResponses: false` no Apollo mantém `extensions` só com o `code`.

## Pegadinhas de versão (setembro de 2026)

- **MikroORM 7 e AutoMapper 9 são ESM-only.** A app roda em CommonJS porque o Node 22 faz `require(esm)`; o Jest não — daí Vitest + `unplugin-swc`, que é a receita do próprio Nest para SWC. Os decorators do ORM (`@CreateRequestContext`, `@Transactional`) moram em `@mikro-orm/decorators/legacy` (TypeScript `experimentalDecorators`) — o pacote `es` é para os decorators do TC39.
- **TypeScript 7 não tem API programática.** O Nest CLI recusa; o `package.json` pina `typescript@^6`. O `tsconfig.build.json` precisa de `rootDir` explícito (TS 6).
- **graphql 16.** O `@nestjs/graphql` 14 aceita 16 e 17; ficou o 16 por compatibilidade com o ecossistema de subscriptions.
- **O `@automapper/nestjs` 9 declara peer de `@nestjs/*` 10 ou 11**, e este projeto está no 12. O pnpm avisa; o pacote usa só `Module`, `mixin`, `Inject` e `Optional`, que não mudaram — e o e2e exercita o `MapPipe` e o `MapInterceptor` no caminho real.
- **`fieldResolverEnhancers: ['interceptors']` não é opcional aqui.** Por padrão o @nestjs/graphql liga guards/filters/interceptors só nos resolvers de raiz e os **desliga** nos `@ResolveField`. Sem essa linha, `Post.author` e `Author.posts` devolveriam o agregado cru — e o sintoma é um `Cannot return null for non-nullable field PostConnection.edges`, que não aponta para lugar nenhum.
- **No bundler.** Each application builds with `nest build` (which runs `tsc`) and each library with
  `tsc --build`; the `@nx/nest` generator would have put a `webpack.config.js` there, and a bundler
  mangles class names and drops the `design:type` metadata AutoMapper reads — mapping breaks at
  runtime while the build still succeeds.
- **Two concurrent queries on one in-memory SQLite are two databases.** MikroORM opens a second pooled
  connection and, for `:memory:`, that connection is a *different, empty* database. The symptom is
  `table … already exists` from the schema generator, or a read that finds nothing it has just
  written. Serialise them (this bit `MikroOrmEventStore.append`).
- **The global auth guard is inherited by the microservice.** `connectMicroservice(..., { inheritAppConfig: true })` brings
  the filters and interceptors, which is what you want, and the guard, which answers `UNAUTHORIZED` to
  every delivery. The messaging controllers carry `@AllowAnonymous()`: what authorises them is the
  queue they arrived on.
- **`CqrsModule.forRoot()` is a dynamic, global module**, and a dynamic module is not the static class.
  A library that imports the static `CqrsModule` while the application uses `forRoot()` gets a *second*
  `EventBus`, whose handlers nobody registered — every local handler, saga and subscription stops being
  called, silently. See `libs/transport-eventbus/NOTICE.md`.

## Próximos passos possíveis

- Event store de verdade: trocar o `DefaultPubSub` por um `IEventPublisher` que apende antes de publicar (`eventPublisher` nas opções do `CqsrsModule`, repassadas ao `CqrsModule`), e `loadFromHistory` no repositório — o domínio já suporta replay.
- Subscriptions entre processos: o `SubscriptionBus` já compartilha stream por chave dentro do processo; com mais de uma instância, o passo é um handler que ligue a mensagem a um stream distribuído (Redis, NATS) em vez do `EventBus` local — nada além do handler muda.
- Mutations de tag (`createTag`, `assignTag`, `removeTag`) — command e agregado já existem; falta o `@Mutation`.
- Projeção nos event handlers (tirar o `save` do command) para recuperar o read model derivado do stream.
- Backpressure no helper (descartar ou limitar a fila) para assinantes lentos.
- Paginação por keyset também em `Post.tags`, se as tags virarem relação.
- **O N+1 de `Author.posts`**, que `Post.author` abriu: `posts(first: 20) { author { posts { … } } }` chega ao `AuthorPostsResolver` vinte vezes, e cada vez é uma consulta paginada. (`posts { author { … } }` sem descer não é N+1 — o populate do repositório o cobre, e há teste.) A saída nativa é o `dataloader: DataloaderType.ALL`, já ligado no config, passando a valer para este campo — o que pede a página pela **relação** do agregado (`Author.posted`, que o dataloader agrupa) em vez de uma consulta por autor. O que hoje impede é o `populate`, que o `Author.posted` não declara: ver `PostRepository.findByAuthor`.
- **Tirar o `authorName` dos eventos**, ou assumi-lo como projeção: hoje ninguém o lê. A pergunta que a decisão faz é se este sistema quer poder dizer "o nome do autor na época", que é o que um `authorId` sozinho não diz.
- `deleteMe` / `restorePost` / `deletePost`: as mutations de exclusão lógica que a versão Axon expõe. O domínio já as tem inteiras (`softDelete`/`restore` no mixin, e `PostRepository.restore`/`UserRepository.restore` para a linha reaparecer); falta o `@Mutation`.
- `bio` no `Author` — a única diferença de campo entre o `type Author` de lá e o daqui.
