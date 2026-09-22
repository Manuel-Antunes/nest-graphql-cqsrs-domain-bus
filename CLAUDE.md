# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code style

### Do not write comments

**Write no comments.** Not JSDoc, not block comments, not end-of-line comments. The codebase is
deliberately comment-free: naming, types and structure are expected to carry the meaning.

The only exceptions:

1. **The developer explicitly asks** for a given field, function or block to be commented. Comment
   that thing only — do not take the request as licence to annotate the surrounding code.
2. **The comment is load-bearing**, i.e. removing it changes behaviour: `@ts-expect-error`,
   `@ts-ignore`, `@ts-nocheck`, linter directives, bundler hints. There are currently two in the
   repository, both `@ts-expect-error` in `libs/validated-dto/src/mixins/validated-dto.mixin.spec.ts`.
3. **The in-house libraries** — `libs/cqsrs`, `libs/database`, `libs/validated-dto` and
   `libs/transport-eventbus` — may carry **JSDoc**, and only JSDoc (`/** … */`), as usage
   documentation of their public API. These are
   general-purpose libraries that happen to live in this repository: their callers read the signature
   and the doc popup, not the implementation, so documenting what a type, option or method is for
   earns its keep. The rule still holds inside them for `//` and `/* */` comments, **except** where a
   block comment records a measured failure that the code cannot express (`transport-eventbus` has a
   few of those, each naming the symptom it prevents), and for their `.spec.ts` files, which carry no
   comments at all.
4. **`libs/transport-eventbus/NOTICE.md`** is where the vendoring of
   [nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus) is
   accounted for: what came from upstream, what the new versions forced, what this repository added.
   Anything that changes that library's relationship to upstream belongs there.

GraphQL `"""descriptions"""` in `apps/posts-api/src/graphql/*.graphql` are **not** comments — they are
part of the schema and are served through introspection and GraphiQL. Keep them. SDL `#` comments are
comments; do not write them.

The shell scripts and the JavaScript under `docker/` are the exception to the exception: they are a
test harness, they are read by whoever is debugging a broker at 2am, and they carry comments.

When a piece of code seems to need an explanation, prefer, in this order: a better name, a smaller
function, a type that makes the invalid state unrepresentable, a test that demonstrates the
behaviour. If the reason is genuinely architectural — why a decision was taken, what breaks if it is
reversed — it belongs in `README.md`, which is the project's design documentation.

### Write in English

**All new code, identifiers, strings, log and exception messages, test names and documentation
should be written in English.**

The repository predates this rule, so a large amount of Portuguese remains: `README.md`, exception
messages, log lines, GraphQL descriptions and test names. Do not mass-translate it — that is a
separate, explicit task. Follow the English rule for anything you add or substantially rewrite, and
leave surrounding Portuguese alone unless asked.

## Commands

Package manager is **pnpm** (pinned: `pnpm@10.28.0`), workspace orchestrated by **Nx 23**.

```bash
pnpm install
pnpm db:setup                  # apps/migrator: migrations on both databases, then the seeders
pnpm dev                       # db:setup, then nx run-many -t serve: the two applications at once
pnpm build                     # every project; each app builds with `nest build` (tsc, no bundler)
pnpm typecheck                 # nx run-many -t typecheck: tsc --build per project
pnpm test                      # nx run-many -t test: every project's Vitest suite
pnpm test:e2e                  # apps/posts-api over HTTP + WebSocket, in-memory transport
pnpm test:web                  # apps/web-e2e: Playwright, THREE PROCESSES over real RabbitMQ
pnpm test:all                  # every level, the browser included
pnpm graph                     # the project graph, which is also the layer graph
```

The schema is **never** created by an application (see `apps/migrator/README.md`):

```bash
pnpm db:migrate                                 # migration:up, posts     (:tagging for the other)
pnpm db:migration:create -- --name add-a-thing  # writes apps/migrator/src/migrations/posts/*.ts
pnpm db:seed                                    # seeder:run, posts
pnpm db:fresh                                   # drop, remigrate, seed
pnpm db:revert                                  # migration:down, one step
```

One project, one file or one test:

```bash
npx nx test @nestposts/posts                        # a single project's suite
npx nx run-many -t test --projects=@nestposts/posts,@nestposts/platform
cd libs/posts && npx vitest run src/domain/post/post.entity.spec.ts
cd apps/posts-api && npx vitest run --config vitest.e2e.config.mts -t "onPostCreated"
cd apps/web-e2e && npx playwright test src/specs/authorization.spec.ts
cd apps/web-e2e && npx playwright test -g "o x-tenant do navegador"   # and --ui for the trace viewer
```

Environment variables, per application:

| | posts-api | tagging |
|---|---|---|
| database | one Postgres for both: `POSTGRES_URL` (default `postgresql://nestposts:nestposts@localhost:5432/nestposts`) | idem |
| schema | `POSTS_SCHEMA` (default `posts`) | `TAGGING_SCHEMA` (default `tagging`) |
| | the same variables address `apps/migrator`, which is what creates those schemas | |
| transport | `POSTS_TRANSPORT` = `rabbitmq` (default) \| `memory` | `TAGGING_TRANSPORT`, same |
| publishing | `POSTS_PUBLISH_EVENTS=false` turns the outbound half off | `TAGGING_PUBLISH_EVENTS` |
| the tagging step | `POSTS_TAGGING_IN_PROCESS=true` doubles it in process (the suite sets it) | — |
| broker | `RABBITMQ_URL`, `POSTS_EXCHANGE`, `POSTS_COMPLETED_QUEUE` | `RABBITMQ_URL`, `TAGGING_EXCHANGE`, `TAGGING_QUEUE` |
| auth | `AUTH_URL`, `AUTH_SECRET`, `AUTH_BASE_PATH` (default `/api/auth`), `WEB_URL`, `AUTH_TRUSTED_ORIGINS`, `AUTH_COOKIE_DOMAIN`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` — see `libs/auth/README.md`. **Every process that reads a session shares `AUTH_SECRET`**, `apps/web` included | — |
| other | `PORT`, `MIKRO_ORM_DEBUG=true` | `MIKRO_ORM_DEBUG=true` |

## Architecture

DDD/CQRS proof of concept: an Nx monorepo with **two NestJS 12 applications** talking over
**RabbitMQ**, on `@nestjs/cqrs` 12 + MikroORM 7 (PostgreSQL, one schema per service) + `@nestjs/graphql` 14 (Apollo,
**schema-first**). A TypeScript rewrite of `axon-graphql-posts` (Axon 5 + Quarkus) — the README carries
the Axon → Nest translation table, which is worth reading whenever a choice looks arbitrary.

### `libs/` has domain and infrastructure. `apps/` has application and presentation

The line is not between services, it is between **layers** — and that is what makes a library
reusable. Domain is rule and infrastructure is how the rule persists: both belong to the *module*
(posts, users), and more than one application can import them. Application is flow — which command
exists, which query answers what, which event chains into the next step — and flow belongs to
**whoever executes it**.

```
libs/platform            domain/shared (aggregate root, soft delete, delegation, @EventType)
                         infrastructure/persistence (delegated references, soft delete's ORM half)
libs/database            the one door to MikroORM: the connection, DatabaseModule, valueObjectType,
                         inRequestContext, what a driver exception means (see below)
libs/users               domain/user + its ORM mapping and repositories, wired by
                         UsersInfrastructureModule. It knows nothing about Better Auth
libs/auth                authentication: the Better Auth server instance and its CORE plugin
                         registry, auth_user and the tables Better Auth generates, the AuthService
                         port and the IdentityProvider adapter. Knows nothing about organizations
libs/organizations       organizations, members and invitations: the three tables, their domain and
                         repositories, the OrganizationService port, and the `organization` plugin it
                         CONTRIBUTES to the instance libs/auth builds. Both have READMEs
libs/posts               domain/post + domain/tag + their ORM mappings and repositories,
                         wired by PostsInfrastructureModule
libs/cqsrs               the third CQRS message (see below)
libs/validated-dto       Zod → DTO/value object mixins
libs/transport-eventbus  the CQRS event bus over Nest's microservice transports (see below)

apps/posts-api           application + interfaces (GraphQL, messaging), a HYBRID application:
                         HTTP/WebSocket and a RabbitMQ microservice in one process
apps/tagging             one step of the saga, a FULL microservice: no HTTP port at all
apps/migrator            the migrations and the seeders of both schemas — the only thing that
                         writes DDL, and the only thing that seeds (see below)
apps/web-e2e             the whole system through a BROWSER: Playwright over three processes and a
                         real broker — authentication, authorization, the reading path and the saga
apps/web                 a Next.js client, to see the API from outside (not part of the saga). It boots
                         a Nest CONTAINER of its own and holds the same Better Auth — see below
```

What that buys, concretely: `apps/tagging` imports `libs/posts` and gets the `Post`, its events, its
rules (including which tag is the default) and its repositories. It does **not** get the GraphQL
layer, the projections or the command handlers of the other application — which would be handlers
wired against tables it does not have.

Each project is a pnpm workspace package (`@nestposts/*`) with **no barrel for the domain**: a file is
imported by its own path (`@nestposts/posts/domain/post/post.entity`), through the wildcard `exports`
map in its `package.json`. Under Vitest those packages resolve to **source**, through the aliases in
`vitest.shared.mts` — resolving to `dist` makes the same module exist twice in one run and produces
two delegation registries and two prototypes of every class.

### The module chain is still the layer boundary — and below it, one module per DOMAIN module

```
InterfacesModule  →  ApplicationModule  →  PostsInfrastructureModule
                                           UsersInfrastructureModule
                                           OrganizationsInfrastructureModule
```

Each module imports **only** the one below it, and `AppModule` lists `InterfacesModule`, the transport
and the ORM — the rest arrives transitively, on purpose. A resolver cannot inject `PostRepository`: the
ports leave only through the infrastructure module of their own domain module, which the application
layer imports and the interfaces layer does not.

Those two modules live in the **libraries** (`libs/posts/src/infrastructure/posts-infrastructure.module.ts`,
`libs/users/src/infrastructure/users-infrastructure.module.ts`), next to the adapters they bind, which is
the shape `BetterAuthModule` (`libs/auth`) has as well. What an importer asks for is a domain module (`posts`), not a
layer ("the persistence of everything"), and `apps/tagging` shows why it matters: it imports neither,
because it decides about a Post through its event store and has no repository at all.

### CQSRS: the third message (`libs/cqsrs`)

A small in-house library, which knows nothing about GraphQL, adding a subscription bus to Nest's CQRS:

| | message | decorator | method | bus | result |
|---|---|---|---|---|---|
| command | `Command<T>` | `@CommandHandler` | `execute` | `CommandBus` | `Promise<T>` |
| query | `Query<T>` | `@QueryHandler` | `execute` | `QueryBus` | `Promise<T>` |
| subscription | `Subscription<TEvent, TCriteria>` | `@SubscriptionHandler` | `subscribe` | `SubscriptionBus` | `Observable<TEvent>` |

- **The `@nestjs/cqrs` `EventBus` is the subscription emitter** — it is an `Observable`/`Subject`, and
  a handler returns `eventBus.pipe(ofType(Event))`. There is no `graphql-subscriptions` `PubSub`, and
  no parallel `Subject`.
- **The filter belongs to the message, and the filter is the key.** `Subscription.match(event)` lives
  on the message class (application layer), and `Subscription.key` (`name(criteria)`) is what makes
  two subscribers with the same criteria share **one** stream and **one** `EventBus` subscription.
- `subscribeAsAsyncIterable(bus, sub)` is the push→pull glue; it resolves pending `next()` calls with
  `done: true` immediately, which an `async function*` does not do — changing it reopens a leak of one
  subscriber per disconnecting client.
- **`aggregatePublisher` is what the application's `EventPublisher` is.**
  `CqsrsModule.forRoot({ aggregatePublisher: TOKEN })` binds it through `AggregatePublisherModule`,
  which is imported **and** exported before the re-exported `CqrsModule` — both orders matter, because
  a handler resolves either through the exports of the module it imports or through the global modules
  in registration order, and the loser of either race is Nest's plain publisher, silently. The
  publisher itself has to come from a global module (`TransportModule` is one).

### transport-eventbus: the CQRS bus across services (`libs/transport-eventbus`)

A vendored and adapted copy of **nestjs-transport-eventbus** plus an integration layer.
`README.md` in that directory is the usage guide — wiring, publishing, receiving, testing without a
broker, adding a transport — and `NOTICE.md` is the account of what came from where; read the second
before changing the library's shape. The essentials:

- **The integration point is `IEventBus`.** `TransportEventBusService` stands in for the CQRS
  `EventBus`: everything that already publishes — a handler, a saga, an aggregate's `commit()` —
  publishes through it, and the events that are addressable leave the process as well. That is
  upstream's idea, and the reason this library is built on it rather than beside it.
- **`EventPublisher` IS the transport publisher**, in both applications: each one's
  `CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER })` substitutes it at the
  composition root, so a command handler injects the plain `EventPublisher` and its aggregates commit
  to the transport. Without that binding a handler gets Nest's own publisher, it still works, and its
  events silently never leave — which is what the binding exists to make impossible.
- **An event's identity on the wire is `@EventType({ namespace, name, version, tags })`**
  (`libs/platform`): `posts.PostCreated#2.0.0`, tagged by `postId`. It is what routes the event, what
  the routing key's last segment comes from, and what lets the other side rebuild the **real class** —
  which `@nestjs/cqrs` 12 requires, because it matches handlers by an id it stamps on the event class,
  not by its name. An event with no `@EventType` keeps upstream's behaviour: its class name, no
  namespace, and therefore no routing key.
- **The namespace is the routing, and the event declares nothing else.** A destination is a provider
  holding a `ClientProxy`, marked `@Publisher(POSTS_NAMESPACE)` (or a list, or `EVERY_NAMESPACE` for
  upstream's one-bus mode), and it takes every event whose `@EventType({ namespace })` matches. There is
  no `@TransportType` on an event: it would be the same fact twice and a deployment detail inside a
  domain event — which is also why `libs/posts` imports **nothing** from this library. The code says
  **what** goes out; the `ClientsModule`-style factory says **where**.
- **`TransportEventBusModule.forRoot(...)` starts it**, in each application's `AppModule`: `identity`,
  `publishers`, `inbox` (which turns receiving on), `eventStore: [Post]`, `requestContext`, `sink`. It
  is global, and `forRootAsync` is the same with the identity resolved at runtime. Underneath it are the
  provider arrays (`transportEventBusProviders`, `eventIngestionProviders`, `eventStoreProviders`),
  still exported for a service — or a spec — that wants to compose them by hand.
- **The transport's tables come with its options**: `inbox` brings the inbox's schema and `eventStore`
  the streams', through `DatabaseModule.forFeature`. A publish-only service needs no database at all.
- **`TransportIdentity` is the mark of authorship, not an address.** Bound with
  `TransportIdentity.named('tagging', { publishes })` (or `.silent('…-spec')` in a suite), it is what
  every published message carries and what the ingestion compares to drop this service's **own echo** —
  which is what makes binding a namespace one also publishes to safe. Remove it and `apps/tagging`
  ingests its own `PostCreated` and decides again (`tagging.spec` covers exactly that).
- **The wire is `EventEnvelope`: `data` (the event as the application wrote it) and `metadata` (a flat
  map of strings).** Each transport has a pair — `RmqEventEnvelopeSerializer`/`Deserializer` put the
  metadata in the **AMQP headers** (through `RmqRecordBuilder`) and the event in the body;
  the `Memory*` pair keeps both halves in the value. They are declared in the client's and the
  server's options, which is where `@nestjs/microservices` asks for them.
- **A controller's parameter is the event, through `@TransportEvent()`** — a `@Payload()` bound to
  `TransportEventPipe`, which rebuilds the real class from the envelope and marks it as ingested. Extra
  pipes compose (`@TransportEvent(new ValidationPipe())`), and `@TransportRequest()` is the other half:
  the `AsyncContext` the message belongs to, for a controller that dispatches a command itself.
- **A binding is `EventAddress.everyEventOf(...)`**: a namespace (`posts.#`, one entry for every event of it — the
  message type resolves the concrete class) or one event class (`posts.PostCreated.*`). `apps/tagging`
  binds the namespace because it keeps the Post's whole stream; `apps/posts-api` binds the one type it
  waits for. `EventIngestion` refuses an event that did
  not come through it, because without the mark there is no identifier and the inbox cannot tell a
  redelivery from a new fact.
- **The routing key is the event's own** (`EventAddress.routingKey`): `namespace.Name.aggregateTag`,
  which is what lets a consumer bind to `posts.PostCreated.*`; an event with no `@EventType` goes out
  under `TRANSPORT_EVENT_BUS_PATTERN`, upstream's single pattern. A transport that addresses
  differently rewrites the pattern in its own serializer — there is no addressing abstraction, and the
  one that existed was removed once the serializers owned the wire and `@Publisher` owned the
  destination.
- **Three guards keep one delivery one thing**: the origin mark on the message (an event this service
  produced and got back is dropped, which is what cuts the publish/ingest loop), the `MessageInbox`
  row written in the same transaction as the work, and the aggregate's own state — the last one being
  the only one that survives an emptied inbox.
- **The inbound half is opt-in** (`...eventIngestionProviders` plus a `MessageInbox` binding), because
  the outbound half needs no database.
- **Event sourcing is the framework's, not an application's** (`persistence/event-store`):
  `...eventStoreProviders` binds the `EventStore` and the `IngestionSink` that appends every ingested
  event to the stream of the aggregate its `@EventType({ tags })` names, and
  `EventSourcedRepository.of(Post)` is the replay — load, let the domain decide, `save()`, `commit()`.
  A service that event-sources adds `eventStoreEntities` to its MikroORM list and writes **no** store,
  no sink and no repository of its own.
- **The request crosses the wire.** `publish(event, request)` attaches the `AsyncContext` exactly as
  `EventBus` does; `RequestContextCodec` writes what it stands for onto the envelope (correlation,
  causation, and whatever the application's context declares in `toAttributes()`); the ingestion
  restores it and publishes **with** it, so `PostRequest.of(event)` answers on the other side too.
  A codec of its own overrides **`contextFor`**, never `decode`: `decode` is what writes the arriving
  correlation id onto the rebuilt context, and replacing it starts a new trace at every hop, silently.
- **A guard reads the request with `IncomingRequest.of(executionContext)`**, because a pipe (and so
  `@TransportRequest()`) runs after the guards. That is what lets a shared guard authorise a message by
  the tenant or the session the publishing service put in its context.
- **What the ingestion's transaction covers**: the inbox row and whatever the `IngestionSink` awaits.
  The event reaches the local bus **after** that transaction commits — a handler triggered from
  inside it inherits the transaction through the async store and then finds it gone
  (`Transaction is already committed`).

### The choreographed saga: a post is born in two phases

```
apps/posts-api                    routing key                        apps/tagging
──────────────────────────────────────────────────────────────────────────────────────────
createPost → PostPreCreated  ──▶  posts.PostPreCreated.<postId>  ──▶  decides the first tag
  (answers version 1, no tags)                                              │
ProjectPostCompletion        ◀──  posts.PostCreated.<postId>      ◀──  Post.complete(...)
  → the read model reaches version 2
  → onPostCreated delivers the COMPLETE post
```

- `Post.create(...)` raises **`PostPreCreatedEvent`** and answers at version 1, `publishedAt` null.
  `Post.complete(tags, now)` raises **`PostCreatedEvent`** (version 2, with the tags) and is what
  `isComplete()` reads. A post born *with* tags goes through both in the same unit of work.
- `onPostCreated` therefore means "**it is complete**", not "it was born". That is the cost of the
  choreography, and it is deliberate.
- Neither application names the other: each declares the routing keys it binds to.
- `apps/tagging` has **no read model**. It event-sources the `Post` through the framework's event store
  (`...eventStoreProviders` + `EventSourcedRepository.of(Post)` in its `TransportModule`): what it
  ingests is appended to the aggregate's stream, the `Post` is replayed from it with `loadFromHistory`,
  and its own decision is appended and published. That is why it can decide about a Post without having
  a row for one — and why it also ingests `PostUpdated`/`Deleted`/`Restored`, which nothing there reacts
  to: a decision taken against half a history is a wrong decision.
- In the `apps/posts-api` suite the tagging step is **doubled in process**
  (`InProcessTagAssignment`, behind `POSTS_TAGGING_IN_PROCESS`), because eventual consistency makes an
  in-flight message cross the boundary of a test that truncates between cases. The real path is
  covered by `pnpm test:web`.
- The default tag's id is a **domain fact** (`DEFAULT_TAG_ID` in `libs/posts`), which is what makes two
  services arrive at the same id instead of keeping two constants in step by hand. The row itself is
  `DefaultTagSeeder` in `apps/migrator`, run by `pnpm db:seed` — and, in the e2e, by an explicit
  `orm.seeder.seed(DefaultTagSeeder)` in `beforeAll`.

### A slice is one file, message and handler inside a `namespace`

`CreatePostCommand.CreatePost` and `CreatePostCommand.Handler` live in `create-post.command.ts`, with
the `.spec.ts` beside it. Same for `*.query.ts`, `*.subscription.ts`, `*.saga.ts`, `*.handler.ts`.
**Every new handler must be registered in its application's module** (the explorers scan the
`ModulesContainer`, not the disk).

### `PostRequest`: the request travels the whole chain

The edge creates `new PostRequest(postId, tenantId)` and passes it to `commandBus.execute(command, request)`.
Command handlers are `{ scope: Scope.REQUEST }` + `@Inject(REQUEST)`, and stamp events via
`publisher.mergeObjectContext(post, this.request)`. A saga reads it back with `PostRequest.of(event)`
and forwards it with `request.attachTo(command)` or `AsyncContext.merge(event, command)`. Across
services it travels as the metadata `PostRequest.toAttributes()` declares, and
`PostRequestContextCodec` rebuilds it on the other side. An `execute` without that context compiles,
passes the happy path and breaks the saga — hence the dedicated tests in `post-request.spec.ts`.

### Tenancy: `x-tenant` is the worked example of what "the request travels" buys

`TenancyModule.forRoot()` (`@nestposts/database`) puts every request inside its tenant's entity
manager — `TenantMiddleware` for HTTP and GraphQL, `TenantInterceptor` for a subscription or a message,
the second deferring to a context the first already opened. `libs/database/README.md` is the guide.

The tenant then **rides the request the whole way**, and that path is worth following because it is the
same one everything else takes:

```
x-tenant: Acme  ──▶  @CurrentTenant()  ──▶  new PostRequest(postId, 'acme')
                                              │ toAttributes()
                                              ▼
                                       AMQP header x-tenant  ──▶  apps/tagging
                                                                    │ TransportTenantResolver
                                                                    │ reads it off the envelope
                                                                    ▼
                                                            its own decision goes back out
                                                            carrying the SAME x-tenant
```

- **Where the tenant is read from is the `TENANT_RESOLVER` token**, and it takes a function, an
  instance or an injectable class — a class being registered by `TenancyModule` itself, so its
  dependencies resolve from inside and nothing is provided from outside. `HeaderTenantResolver` is the
  default; `TransportTenantResolver` (`libs/transport-eventbus`) answers for a message, decoding the
  envelope through `IncomingRequest` — **not** `@TransportRequest()`, because an interceptor runs
  before the pipes, the same reason a guard cannot use it either. It falls back to the header
  resolver, because `apps/posts-api` is a hybrid and one resolver has to be right for both.
- **`TransportRequestContext.toAttributes()` re-emits what arrived**, which is what makes a service in
  the middle of a chain carry the tenant onward without knowing tenants exist. It excludes everything
  under `TRANSPORT_METADATA_PREFIX`: re-emitting `cqrs-transport-origin` would republish somebody
  else's authorship, the far side would read its own name and drop the message as its echo, and the
  saga would stop dead with every message still flowing. `tagging.spec` catches exactly that.
- The proof is `pnpm test:web`, which asserts `x-tenant` on the AMQP headers of **both** events —
  the one posts-api published and the one tagging decided.
- **An organization's schema is created by a trigger, not by code.** `Organization` carries a MikroORM
  `trigger` (`defineEntity({ triggers })`) that creates `tenant_<slug>` on insert and drops it
  `cascade` on delete, emitted into a migration like any other DDL — so the schema's existence is a
  property of the row. It quotes with `%I`, not `%s`: a slug may carry a dash and `tenant_acme-corp`
  is not a valid unquoted identifier. The schema is somewhere for a `SchemaPerTenant` policy to point;
  what goes INSIDE it would still be `apps/migrator`'s, and the default policy here is
  `SharedSchemaTenants`.

### The domain decides and evolves; the application orchestrates

Entities extend `AggregateRoot(WithSoftDelete(BaseEntity))`: decision methods
(`create`/`complete`/`update`/`assignTag`) call `this.apply(event)`, which dispatches to the
`on<Event>` handlers — and those must be **idempotent**, because they are also the replay path
(`loadFromHistory`, which `apps/tagging` and the completion projection both use). The command handler
loads through the repository, lets the domain decide, calls `save()` and **only then** `commit()`.
Sagas do not write: they dispatch commands.

### Every Zod schema lives in the domain module's `schemas/` folder

Inside a library's `domain/`, a Zod schema is **never** written inline. Each domain module keeps its
schemas in its own `schemas/` folder, one file per schema, named `<thing>.schema.ts`, exporting a
`<Thing>Schema` const:

```
libs/posts/src/domain/post/
  schemas/                       ← the rules: what a valid value IS
    post-id.schema.ts            → PostIdSchema
    post-title.schema.ts         → PostTitleSchema, POST_TITLE_MAX_LENGTH
    post-content.schema.ts       → PostContentSchema
    new-post.schema.ts           → NewPostSchema / PostChangesSchema (+ their inferred types)
  vo/                            ← the behaviour: what a valid value DOES
    post-id.ts                   → class PostId extends ValidatedDto.Scalar(PostIdSchema)
    post-title.ts                → class PostTitle  (adds `length`)
    post-content.ts              → class PostContent
```

The same shape exists under `tag/`, `libs/users/src/domain/user/` and
`libs/platform/src/domain/shared/soft-delete/` (`SoftDeletionSchema`).

**Why the split.** A schema and a value object answer different questions. The schema is a *value* —
composable, reusable, narrowable (`PostTitleSchema.max(40)`), and something a DTO or another schema can
import without dragging in the class. The value object is the *type* the domain speaks in.

**The rules:**

- **A value object never declares its own rules.** `vo/*.ts` imports its schema and does nothing but
  `extends ValidatedDto.Scalar(TheSchema)` plus domain behaviour (`PostId.generate()`,
  `Email.domain`, `PostTitle.length`).
- **Constants that the schema uses live with the schema**, not with the value object —
  `POST_TITLE_MAX_LENGTH` is in `post-title.schema.ts`, and `post-orm.entity.ts` imports it from
  there to size the column. One number, one home, read by both the validation and the DDL.
- **Composite schemas go in `schemas/` too**, alongside the scalar ones — `NewPostSchema`,
  `PostChangesSchema`, `NewUserSchema`. They are built from `VO.field()`, so they import from `vo/`
  while the value objects import from `schemas/`. That is not a cycle: it runs
  `schemas/post-title.schema` → `vo/post-title` → `schemas/new-post.schema`, and no file closes
  the loop.
- **A composite schema owns its inferred type.** `export type NewPost = z.input<typeof NewPostSchema>`
  sits in the schema file; the entity imports the schema for `safeParse` and re-exports the type.
- **No barrel `index.ts`.** Import the specific file — across packages too, which the wildcard
  `exports` map is there to allow.

Adding a value object is therefore two files: the schema, then the class that wraps it.

This applies to the libraries' `domain/` only. The GraphQL DTO schemas under
`apps/posts-api/src/dto/graphql/` are a different layer with a different job (they carry
`AUTOMAP_REGISTRY` decorator metadata) and stay where they are.

### Persistence: the domain carries no ORM decorator

The mapping lives in `libs/*/src/infrastructure/persistence/entities/*-orm.entity.ts`, via
`defineEntity({ class: Post, ... })`. Value objects become columns through
`valueObjectType(PostId, { columnType })`.

**The entity list is not a list.** `DatabaseModule.forRoot(mikroOrmConfig())`
(`libs/database/src/database.module.ts`) is the connection, and every table
reaches it through `DatabaseModule.forFeature(...)` in the module that **owns** it:
`PostsInfrastructureModule`, `UsersInfrastructureModule`, `BetterAuthModule` (the Better Auth tables, composed
with whatever a contributed plugin adds) and `TransportEventBusModule` (the inbox, the streams). An application's `mikro-orm.config.ts` therefore
holds the connection and nothing else — and `apps/tagging`, which needs the Post's *mapping* but not its
repositories, imports `DatabaseModule.forFeature([...postsEntities, ...usersEntities])` and nothing more.

Two measured failures are why `forRoot` resolves that list **lazily**, in a factory, instead of using
`autoLoadEntities`: the flag fills `entitiesTs` with only the registered entities and MikroORM prefers
that list under TypeScript (the application's own entities vanish, and the symptom is
`Cannot read properties of undefined (reading '__em')`); and Nest's own registry is cleared when an
application closes, so in a suite that boots a module per test the second one comes up with
`Metadata for entity User not found`.

**A feature that spans layers gets a folder of its own in each layer it touches.** Soft delete is the
worked example:

```
libs/platform/src/domain/shared/soft-delete/           ← the rule
  soft-delete.ts                        → WithSoftDelete (mixin), SoftDeletion (embeddable)
  already-deleted.exception.ts / not-deleted.exception.ts
  schemas/soft-deletion.schema.ts       → SoftDeletionSchema

libs/platform/src/infrastructure/persistence/soft-delete/   ← the mechanism
  soft-delete-orm.entity.ts             → activeFilter, softDeleteProperty, softDeleteIndex
  soft-delete.subscriber.ts             → swaps DELETE for UPDATE deleted_at
```

The ports are **abstract classes** in `libs/*/src/domain/*/*.repository.ts` (they double as DI tokens)
and the adapters are bound by the module that owns them — `PostsInfrastructureModule`,
`UsersInfrastructureModule` — which is what an application imports where it needs them. Paths that do not originate
in an HTTP request — a field resolver inside a subscription (WebSocket), a message arriving on a queue,
Better Auth hooks, tests — need `inRequestContext(em, work)` (`@nestposts/database`), otherwise the
first query is rejected.

**`libs/database` is the one door to MikroORM**, and `libs/database/README.md` is its guide. It holds
the connection (`postgresDatabase`), `DatabaseModule`, `valueObjectType`, `inRequestContext` and
`databaseErrorCode`, and re-exports `@mikro-orm/core` whole plus the legacy decorators. The rule for
what may live there is that it must be understandable **without a domain** — which is why soft
delete's ORM half stayed in `libs/platform` (it maps the `SoftDeletion` embeddable, and
`@nestposts/platform` is upstream of nothing here) and why the GraphQL exception filter stayed in
`apps/posts-api`: the package says a foreign key violation is a `BAD_USER_INPUT`, and the interface
layer says what to tell the client about it.

### The schema is `apps/migrator`'s, and so is the seed

`apps/migrator/README.md` is the guide; the essentials:

- **No application creates a schema.** `postgresDatabase` sets `ensureDatabase: { create: false }` —
  the database is made sure of, the schema is not — so a service whose migrations have not run fails
  with `relation ... does not exist`, which is the honest answer.
- **One schema per service, one config, one migration history.** `posts-mikro-orm.config.ts` and
  `tagging-mikro-orm.config.ts`, each with its own `src/migrations/<folder>` and its own
  `mikro_orm_migrations` table inside its own schema. Only the posts one registers `SeedManager`:
  `apps/tagging` keeps no rows of its own.
- **A migration is bound to the schema it was generated in.** The SQL is qualified
  (`create table "posts"."account"`), so pointing `POSTS_SCHEMA` somewhere else does **not** move a
  migration there. A throwaway schema is built from the entities — `TestSchemaModule` in the suites —
  never from the migrations, which is why `apps/web-e2e` drops and rebuilds `posts` and `tagging`
  instead of inventing names.
- **The migrator names no table.** Each config composes the arrays the owning modules already export
  (`postsEntities`, `usersEntities`, `authWithOrganizationEntities()`, `transportEntities`, `eventStoreEntities`).
  It boots **no** Nest context to find them, because `DatabaseModule`'s registry is process-wide and
  would hand the second database the first one's tables.
- **It depends only on the libraries**, never on the two applications — which is what keeps Apollo,
  Better Auth and the AMQP client out of whatever runs a migration, and what lets
  `apps/posts-api`'s e2e depend on the migrator for `DefaultTagSeeder` without a cycle.
- `dist/main.js` is a module as well as a script: `migrate()`, `seed()`, `setup()`.
  `apps/web-e2e`'s stack calls `node apps/migrator/dist/main.js setup` before starting either service.

### GraphQL edge

- **Schema-first**: the SDL in `apps/posts-api/src/graphql/*.graphql` is the source; resolvers bind by
  name (`@Resolver('Post')`, `@Query('posts')`, `@ResolveField('tags')`). No DTO carries a GraphQL
  decorator. A new field means a `.graphql` file + a resolver + registration in `interfaces.module.ts`.
- **DTOs and VOs come from Zod schemas**: `ValidatedDto(schema)` + `@InheritValidatedMetadata()` for
  objects, `ValidatedDto.Scalar(schema)` for single-value value objects, `.Embeddable` for multi-value
  ones. `VO.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] })` is how a VO enters
  an already-decorated DTO shape.
- **No resolver calls the mapper** (except `createPost`, which needs the session author via
  `extraArgs`). Output leaves through interceptors: `MapInterceptor`,
  `ConnectionInterceptor(Post, PostView)`, `MapSubscriptionInterceptor(Event, View)`,
  `UserViewInterceptor` (the polymorphic dispatch behind `me`). Input arrives through `MapPipe`. Every
  mapping is declared in the AutoMapper profiles under `apps/posts-api/src/interfaces/mapper/`, with
  `valueObjectConverter(PostTitle, String)` per profile for the VO crossing.
- **Messaging is presentation too.** `interfaces/messaging/*.controller.ts` are the ports of entry by
  message: an `@EventPattern` is an address (queue and routing key) exactly as a `@GraphQLApi` is an
  HTTP path. They take the event with `@TransportEvent()`, hand it to `EventIngestion` and get out of
  the way. They carry
  `@AllowAnonymous()`, because a message has no session and the global guard is inherited by the
  microservice.
- **Auth**: only `libs/auth` knows about Better Auth, and only `libs/organizations` knows about
  organizations; everything else talks to `AuthService`, `OrganizationService`, `IdentityProvider` or a
  repository. `AuthInfrastructureModule.forRoot({ plugins, entities, imports })` installs the `/api/auth/*`
  surface and the global guard — which requires a session, so post reads opt out with `@AllowAnonymous()`
  and writes use `@Roles([AUTHOR_ROLE])` + `@CurrentAuthor()`. Organization-scoped handlers use
  `@OrgRoles([...])` and `@ActiveOrganization()` / `@ActiveMember()` / `@ActiveOrganizationId()`, which are
  `@Session()` with one pipe each; the pipes answer from `OrganizationService`. `AuthExceptionFilter` gives
  the auth and organization domain errors their GraphQL codes.
- **`AuthService` and `OrganizationService` are `Scope.REQUEST` and take no headers.** They receive
  Nest's `REQUEST` and turn it into a `Headers` in the constructor (`headersFrom`, which absorbs the
  Express request, the GraphQL context and a headerless microservice message). An instance belongs to
  one request, so nothing can pass the wrong one. Nest's scope bubbling is the cost: whatever injects
  them is request-scoped too, which is why a saga and an event handler use `PostRequest` instead.
- **Errors**: `DomainExceptionFilter` (APP_FILTER) translates a domain exception into a `GraphQLError`
  with `extensions.code`; `MikroOrmExceptionFilter` (on the mutation resolvers) translates an integrity
  violation into `BAD_USER_INPUT`/`CONFLICT` without leaking driver messages.

## Tests

There is no fake repository: handler specs boot the real `CqsrsModule` and a **schema of their own**
on the shared Postgres, through `createCqrsTestingModule([...])` (`apps/posts-api/test/support/cqrs-testing-module.ts`),
registering **only the handler under test** — an accidental dependency between handlers breaks the
test. That module also spreads `transportEventBusProviders` with `TransportIdentity.silent(...)`,
because the handlers commit through the transport publisher and a suite publishes nowhere. The database proves what was saved; `RecordingEvents`
(attached to the `EventBus`) proves what was published. Because handlers are request-scoped, tests
dispatch through the `CommandBus` with a `PostRequest`.

Where a spec lives follows one rule: **next to what it covers, in the project that can see it**. A
spec that needs more than its own library — the persistence integration specs, the delegation over
Post and Author, the exceptions of three modules — lives in `apps/posts-api/test/`, which is the
project where everything meets.

Four levels, and each answers something the others cannot:

| | where | what it proves |
|---|---|---|
| unit / slice | every project, beside the code | the rule, the handler, the mapping |
| integration | `libs/transport-eventbus/src/**`, `libs/auth/src/infrastructure/persistence`, `apps/posts-api/test/persistence` | the envelope, the routing table's refusals, the inbox, the event store and its replay, the ORM mapping — and that Better Auth writes and reads through the entities `libs/auth` maps by hand |
| one hop, in process | `libs/transport-eventbus/src/in-memory/transport-loop.spec.ts` | two services over `MemoryServer` + `MemoryClient`, each able to reach the other: the real class arrives, the request is restored, a redelivery is deduplicated, the loop is cut |
| the whole system, in a browser | `pnpm test:web` (`apps/web-e2e`, **Playwright**) | **three processes over real RabbitMQ**, driven through Chromium: signing in, being refused, the three states of `/posts/new`, the polymorphic `me`, a post read by someone who never signed in — and then what the browser cannot see, in the same test: each service's durable state, both inboxes, idempotency through the broker's management API, the replica channel, one correlation id across two processes, and the `x-tenant` **of the browser** on the headers of both events |

`pnpm test:web` uses the infrastructure that is already listening if there is any — its topology lives
in its own exchange, `nestposts.events` — and `docker compose up` otherwise. The three applications are
**not** compose services: `apps/web-e2e/src/support/stack.ts` builds them and starts each as its own
process (`node dist/main.js`, and `next start` for the web), which is what makes it a test of real
processes. It rebuilds the `posts` and `tagging` schemas from the migrations on every run, so it is not
a suite to point at a database anybody cares about, and it registers its two accounts — one promoted to
`author` — through the web's own sign-up endpoint. `apps/web-e2e/README.md` is the guide, including why
all three processes share one `AUTH_SECRET`.

Coverage excludes `index.ts`, `interfaces/`, `*.interface.ts` and `main.ts`; resolvers, mappers and
DTOs count.

## Gotchas

- **`fieldResolverEnhancers: ['interceptors']` in `GraphQLModule` is not optional.** Without it the
  `@ResolveField` methods return the raw aggregate, and the symptom is a
  `Cannot return null for non-nullable field ...` that points nowhere useful.
- **MikroORM 7 and AutoMapper 9 are ESM-only**; the applications run as CommonJS through Node 22's
  `require(esm)`. Jest cannot do that — hence **Vitest + `unplugin-swc`** (Vite's esbuild does not emit
  `emitDecoratorMetadata`, which Nest's DI needs). The ORM decorators (`@CreateRequestContext`,
  `@Transactional`) come from `@mikro-orm/decorators/legacy`.
- **The build must stay on a non-bundling builder.** Each application builds with `nest build`, which
  runs `tsc` (`nest-cli.json` sets no `builder`/`webpack`), and the libraries with
  `tsc --build tsconfig.lib.json`. A bundler mangles class names and drops the `design:type` metadata
  AutoMapper reads, which silently breaks mapping at runtime while the build still succeeds. **Do not
  let an `@nx/nest` or `@nx/webpack` generator put a `webpack.config.js` back.**
- **`INestMicroservice.init()` runs the bootstrap hooks twice** (Nest 12.0.3: `super.init()` calls
  them, and the `registerModules()` that follows calls them again). Twice through
  `onApplicationBootstrap` is twice through the CQRS explorer, so every `@EventsHandler` is bound
  twice and every event is handled twice. `listen()` is the path `NestFactory.createMicroservice`
  takes and it registers once — which is why the suites start a microservice through
  `startInProcessService` and not through the memory package's `createTestingMicroservice`.
- **A native statement is not resolved against the connection's schema.** `insert into
  transport_message_inbox` reaches whatever the `search_path` finds, which in a service that lives in
  a schema of its own is nothing at all. Raw SQL asks the metadata where the table is —
  `MikroOrmMessageInbox` does, and `tableIn(orm, 'posts')` is the same thing for a spec.
- **`count(*)` is a bigint, and the `pg` driver gives a bigint back as a STRING**, so `'1' === 1` is
  false and an idempotency assertion fails for a reason that has nothing to do with idempotency.
  `apps/web-e2e` sets a type parser for it.
- **TypeScript is pinned to `^6`**: 7 does not expose the programmatic API the Nest CLI uses. Each
  project has three tsconfigs — `tsconfig.json` (the solution), `tsconfig.lib.json`/`tsconfig.app.json`
  (composite, what `typecheck` builds) and, for applications, `tsconfig.build.json` (non-composite,
  what `nest build` uses, resolving the workspace packages through their built `dist`).
- **`nx sync` after adding a dependency between projects**, or `typecheck` refuses to run: the TS
  project references are generated from the `package.json` dependencies.
- The `.graphql` files are **assets** copied by `apps/posts-api/nest-cli.json`; `typePaths` uses
  `__dirname` (so `src/` under Vitest, `dist/` in production).
- **MikroORM picks `pathTs` over `path` whenever the runtime *could* read TypeScript.** The check is
  `config.get('preferTs', Utils.detectTypeScriptSupport())`, and Node 22+ reports type-stripping
  support regardless of what is actually running. Left alone, `seeder:run` on a compiled config loads
  the **sources**, and Node's stripping cannot resolve their extensionless relative imports:
  `ERR_MODULE_NOT_FOUND` on a file that is plainly there. `apps/migrator` sets `preferTs: false`.
- **`seeder.seedersList` is the registration, not the folder.** With it, `seeder:run` resolves classes
  from the config instead of globbing — a new seeder is added there or it does not exist, the same
  rule the CQRS handlers follow.
- `@automapper/nestjs` 9 declares a peer of `@nestjs/*` 10/11 while the project is on 12 — the pnpm
  warning is expected.

## `apps/web` holds its own Better Auth, in a Nest container

The Next server is **not** a client of the posts-api's auth, and it does not assemble a second one
either: `apps/web/src/nest/app.module.ts` is a Nest module that imports the very same
`BetterAuthModule` and `OrganizationsInfrastructureModule` the API does, and
`apps/web/src/nest/container.ts` boots it once with `NestFactory.createApplicationContext`, cached on
`globalThis` so Next's re-evaluation in development does not leave a second pool behind.

**Why a container and not a standalone builder.** One wiring, so there is nothing to keep in step —
and, more to the point, `AuthService` and `OrganizationService` are `Scope.REQUEST`. `Nest.resolve`
registers the incoming `headers()` as the request against a fresh `ContextIdFactory.create()`, so the
service Next resolves is the same object, built the same way, that a resolver injects on the other
side. A server action reads `await (await WebAuth.auth()).signInWithPassword(...)` and the cookie
plugin writes the cookie.

- It imports `BetterAuthModule`, **not** `AuthInfrastructureModule`: the latter installs the
  `/api/auth/*` catch-all and the global guard through `@thallesp/nestjs-better-auth`, which needs an
  HTTP adapter an application context does not have. Next serves those routes itself, through
  `app/api/auth/[...all]/route.ts`.
- `nextCookies()` is registered as a **trailing** plugin: Better Auth requires cookie plugins last.
- `baseUrl` is overridden to this origin, so the cookie belongs to the origin the browser is talking
  to. The secret and the database are the API's, which is what makes the cookie one the API resolves.
- Every resolved provider is wrapped so each call runs inside `inRequestContext`: nothing opens a
  MikroORM context here, because Next owns the request and there is no middleware or interceptor.

**The auth stack is external to the Next bundle, as CommonJS.** `next.config.ts` matches those
packages by *request* and returns `commonjs`, and deliberately does **not** also list them in
`serverExternalPackages`. Doing both is what broke it: they are ESM-only, so Next emitted an
`import()` for them while the CommonJS libraries emitted a `require()`, and Node refused the second
while the first was still evaluating — `ERR_REQUIRE_ESM_RACE_CONDITION`, on every request. One
mechanism means one plain `require`, loaded in order, exactly as `apps/posts-api` does.

**`apps/web/tsconfig.json` turns `experimentalDecorators` on**, or Next's SWC cannot parse `@Module`.
