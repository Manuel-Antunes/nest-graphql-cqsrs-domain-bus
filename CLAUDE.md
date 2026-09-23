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
   `@ts-ignore`, `@ts-nocheck`, linter directives, bundler hints. There are currently five
   hand-written ones (the `/* eslint-disable */` in every `sst-env.d.ts` is generated and does not
   count): two `@ts-expect-error` in `libs/validated-dto/src/mixins/validated-dto.mixin.spec.ts`,
   `react-hooks/exhaustive-deps` in `saga-runner.tsx`, and two where the rule is right in general and
   wrong here — `no-empty-object-type` on `ValidatedDto`'s `Extras = {}` default, which as `object`
   stops a top-level union DTO from accepting a scalar, and `consistent-type-definitions` on
   `entities-probe.tsx`, where an `interface` has no implicit index signature and stops satisfying the
   codegen'd `_Any`. The last two were tried the other way first and `typecheck` caught both.
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
test harness, they are read by whoever is debugging a broker at 2am, and they carry comments. So is
everything under `infra/lambda/` — `collector.yaml` and `otel-preload.cjs` are deployment bootstrap,
not application code: they run before anything this repository wrote, nothing imports them, and what
they are for cannot be read off a call site because there is no call site.

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

### Linting: one config per project, and one rule that is load-bearing

`eslint.base.config.mjs` is the shared half and `eslint.nest.config.mjs` is what the NestJS projects
add to it. **Every project carries its own `eslint.config.mjs`**, even when it is three lines
re-exporting the shared one, because `@nx/eslint/plugin` infers a `lint` target from the presence of
that file and from nothing else — the root config ignores `apps/**`, `libs/**`, `infra/**`. A project
without one is a project that is silently never linted. `nx.json`'s `targetDefaults.lint` is what
gives every one of them the `fix` configuration, so the block is written once rather than seventeen
times.

- **`@typescript-eslint/consistent-type-imports` is OFF for the NestJS projects, and that is not
  taste.** These projects compile with `emitDecoratorMetadata`, and Nest's DI reads the
  `design:paramtypes` it emits. Turn the rule on and `pnpm lint:fix` rewrites
  `constructor(private readonly repo: PostRepository)`'s import to `import type` — the metadata then
  says `Object`, the provider resolves to `undefined`, the build still succeeds and the failure is at
  runtime, far from the edit. `eslint.nest.config.mjs` turns it off for exactly that reason, and the
  proof it works is that `lint:fix` changes **nothing** across the fourteen Nest projects.
- **Generated code is not linted**: `src/gql/**` (codegen) in `apps/web` and `apps/web-e2e`, and
  `apps/migrator`'s `src/migrations/**`, which MikroORM writes.
- **`graphql.config.yml` is what `@graphql-eslint` reads**, and the `web` project's `schema` there
  deliberately **excludes** `apps/posts-api/src/graphql/federation.graphql`. That file is the
  `extend schema @link(...)` line, and with it the plugin takes the federation path and hands the
  document to `buildSubgraphSchema`; without it the schema builds plainly. The federation directives
  the rest of the SDL uses (`@key`, `@shareable`) are declared in `apps/web/federation.graphql`,
  beside the `_Any`/`_Entity`/`_entities` that are already there for the same reason: they exist at
  runtime and codegen cannot see them.
- **CI is `tools/github/*`**, composite actions called by `.github/workflows/ci.yml` — one job per
  check (`test`, `test-e2e`, `web`) through a single `ci` action, so the environment is prepared in
  one place. `web` is the static one: `format:check`, then `lint` and `typecheck` for every project,
  then the Next build.

## Commands

Package manager is **pnpm** (pinned: `pnpm@10.28.0`), workspace orchestrated by **Nx 23**.

```bash
pnpm install
pnpm db:setup                  # apps/migrator: migrations on both databases, then the seeders
pnpm dev                       # db:setup, then nx run-many -t serve: the two applications at once
pnpm build                     # every project; each app builds with `nest build` (tsc, no bundler)
pnpm typecheck                 # nx run-many -t typecheck: tsc --build per project
pnpm test                      # nx run-many -t test: every project's Vitest suite
pnpm test:e2e                  # EVERY app's test-e2e, one at a time: posts-api, then the browser
pnpm test:web                  # apps/web-e2e alone: Playwright, THREE PROCESSES over real RabbitMQ
pnpm test:all                  # the unit suites, then both e2e levels
pnpm lint                      # nx run-many -t lint, then prettier --check .
pnpm lint:fix                  # the same with `-c fix` (eslint --fix), then prettier --write .
pnpm format / format:check     # prettier alone
pnpm graph                     # the project graph, which is also the layer graph

docker compose up -d localstack   # SNS + SQS, with the topology docker/localstack/init creates
docker compose --profile apps up -d --build   # the infrastructure AND the four applications, as images
npx nx run @nestposts/posts-api:docker:build  # one image; `-t docker:build` builds all four
npx sst deploy --stage <name>     # the topic, the queues and apps/tagging as a Lambda
pnpm graph:stack <name>           # the DEPLOYED graph: sst state export → pulumi stack graph
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
| transport | `POSTS_TRANSPORT` = `inngest` (default) \| `rabbitmq` \| `memory` \| `aws` | `TAGGING_TRANSPORT`, same |
| inngest | `INNGEST_BASE_URL` (default `http://localhost:8288`), `INNGEST_SERVE_ORIGIN`, `INNGEST_DEV`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | idem, plus `TAGGING_PORT` (default 3001) |
| publishing | `POSTS_PUBLISH_EVENTS=false` turns the outbound half off | `TAGGING_PUBLISH_EVENTS` |
| broker | `RABBITMQ_URL`, `POSTS_EXCHANGE`, `POSTS_COMPLETED_QUEUE` | `RABBITMQ_URL`, `TAGGING_EXCHANGE`, `TAGGING_QUEUE` |
| aws | `POSTS_TOPIC_ARN`, `POSTS_COMPLETED_QUEUE_URL` — both default to LocalStack | `TAGGING_TOPIC_ARN`, `TAGGING_QUEUE_URL` |
| | `AWS_ENDPOINT_URL` (LocalStack), `AWS_REGION` and the SDK's own credentials address both | |
| subscriptions | `POSTS_SUBSCRIPTION_SOURCE` = `local` (default, this process's `EventBus`) \| `feed` (the shared table, for a service running as several processes) | — |
| logging | `LOG_LEVEL` (default `info`); pretty when stdout is a terminal, JSON otherwise | idem |
| telemetry | `OTEL_EXPORTER_OTLP_ENDPOINT` turns tracing **on** — unset, the SDK never starts; `OTEL_SERVICE_NAME`, and the rest of `OTEL_*` | idem |
| auth | `AUTH_URL`, `AUTH_SECRET`, `AUTH_BASE_PATH` (default `/api/auth`), `WEB_URL`, `AUTH_TRUSTED_ORIGINS`, `AUTH_COOKIE_DOMAIN`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET` — see `libs/auth/README.md`. **Every process that reads a session shares `AUTH_SECRET`**, `apps/web` included | — |
| other | `PORT`, `MIKRO_ORM_DEBUG=true` | `MIKRO_ORM_DEBUG=true` |

## Architecture

DDD/CQRS proof of concept: an Nx monorepo with **two NestJS 12 applications** talking over
**RabbitMQ**, on `@nestjs/cqrs` 12 + MikroORM 7 (PostgreSQL, one schema per service) + `@nestjs/graphql` 14 (**Yoga**,
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
libs/transport-eventbus  the CQRS event bus over Nest's microservice transports (see below),
                         RabbitMQ / SNS+SQS / in-process
libs/observability       the one door to observability: startTelemetry (the OTel SDK) and
                         loggingModule (pino, with trace_id on every record). A library depends on
                         @opentelemetry/api; an application depends on this. Import
                         @nestposts/observability/telemetry, NEVER the barrel — see Observability
libs/lambda              how AWS enters a Nest application: bootOnce (one boot per container),
                         streamingHandler (HTTP over a Function URL) and queueHandler (SQS)

apps/posts-api           application + interfaces (GraphQL, messaging), a HYBRID application:
                         HTTP (GraphQL, and subscriptions over SSE) and a microservice, one process
apps/tagging             one step of the saga, a FULL microservice: no HTTP port at all
apps/migrator            the migrations and the seeders of both schemas — the only thing that
                         writes DDL, and the only thing that seeds (see below)
infra/aws                the deployed shape: the topic, the queues, the four functions and the
                         router, in SST. `infra/aws/README.md` is the guide — read it before
                         touching a filter policy or the bundling options
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
  provider arrays (`transportEventBusProviders`, `eventIngestionProviders`, `eventLogProviders`),
  still exported for a service — or a spec — that wants to compose them by hand.
- **Four transports, one wire idea.** RabbitMQ (`Rmq*` pair, the metadata in the AMQP headers),
  AWS (`SnsClientProxy`/`SqsClientProxy` out, `SqsStrategy` in — the topic is the exchange, a
  subscription's **filter policy** is the binding, and the metadata travels in the body because SNS
  allows ten message attributes) and the in-process pair. `SqsStrategy` runs either as a polling loop
  (`queueUrl`) or driven by a Lambda (`processSqsEvent`, which reports `batchItemFailures`); the
  controllers, the handlers and the events are the same on all three.
- **Inngest is the local default** (`libs/transport-eventbus/src/inngest`), and it inverts who calls
  whom: a broker delivers, Inngest **invokes**. The client proxy sends an event, the strategy turns
  every `@EventPattern` into a function and serves it over the host application's HTTP adapter, and
  the dev server (a container in `docker-compose.yml`) routes between them.
  - **The event's name is the QUALIFIED name**, `posts.PostCreated`, not the routing key: Inngest
    matches a trigger by exact name and has no wildcards, so a name carrying the aggregate would mint
    one event name per post and no function could be declared for it. The aggregate stays in the
    metadata, where the ingestion already reads it.
  - **A binding is resolved at boot**, by `inngestTriggers`: `posts.#` becomes one trigger per
    registered `@EventType` of that namespace, `posts.PostCreated.*` becomes `posts.PostCreated`. A
    function takes at most **ten**, and past that the strategy refuses to start rather than serve
    traffic nothing triggers.
  - **The metadata travels in the event's `user`**, and the request's correlation id **also** becomes
    `meta.sessions.correlation_id` — Inngest's own grouping, which from inngest-js 4.18 propagates by
    itself to every event a run sends. That is `RequestContextCodec`'s job, done by the platform.
  - **`apps/tagging` is a hybrid on this transport**, with an HTTP port whose only route is
    `/api/inngest`. It is the one thing this transport costs that a broker does not, and it is why the
    port exists only in that mode.
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
  server's options, which is where `@nestjs/microservices` asks for them — the AWS pair included.
  `SnsClientProxy` and `SqsClientProxy` used to default to `AwsEventEnvelopeSerializer` and
  `SqsStrategy` to `SqsEventEnvelopeDeserializer`, which made the transport the one deciding what a
  service is allowed to say to something it did not write. They do not any more: the two clients take
  an **optional** serializer and fall through to Nest's own `IdentitySerializer` when given none, like
  any plain `ClientProxy`, and the strategy **requires** its deserializer, because that is the whole
  of how a message becomes an event again. A default wire format is a decision, and it belongs to the
  composition root like every other one here.
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
- **Event sourcing is the framework's, not an application's** (`persistence/event-log`): there is ONE
  table, `event_log`, and two reads of it. `readStream(streamId)` is an aggregate's history, keyed by
  `(stream_id, sequence)`, and `EventSourcedRepository.of(Post)` replays from it;
  `readAfter(position)` is the service's own order, keyed by a global `position`, and it is what a
  subscription reads. They were two tables with the same columns, filled by two write paths with two
  different guarantees, until they were not — the shape is Axon's event store, which reads one store
  by `aggregateIdentifier + sequenceNumber` and by `globalIndex`. A service that event-sources adds
  `eventLogEntities` to its MikroORM list and writes **no** store, no sink and no repository.
- **The request crosses the wire.** `publish(event, request)` attaches the `AsyncContext` exactly as
  `EventBus` does; `RequestContextCodec` writes what it stands for onto the envelope (correlation,
  causation, and whatever the application's context declares in `toAttributes()`); the ingestion
  restores it and publishes **with** it, so `PostRequest.of(event)` answers on the other side too.
  A codec of its own overrides **`contextFor`**, never `decode`: `decode` is what writes the arriving
  correlation id onto the rebuilt context, and replacing it starts a new trace at every hop, silently.
- **A guard reads the request with `IncomingRequest.of(executionContext)`**, because a pipe (and so
  `@TransportRequest()`) runs after the guards. That is what lets a shared guard authorise a message by
  the tenant or the session the publishing service put in its context.
- **What the ingestion's transaction covers**: the inbox row and the `EventLog` append.
  The event reaches the local bus **after** that transaction commits — a handler triggered from
  inside it inherits the transaction through the async store and then finds it gone
  (`Transaction is already committed`).

### The applications are images too, and `@nx/docker` is what discovers them

Each application carries an `apps/<app>/Dockerfile`, and the `@nx/docker` plugin in `nx.json` turns
every one of them into a `docker:build` and a `docker:run` target — inferred from the file's
existence, the same way the Vitest and TypeScript plugins infer theirs. The image is named in that
application's `package.json` (`nestposts/posts-api:dev`), which is also the name `docker-compose.yml`
gives it under the **`apps` profile**, so `docker compose --profile apps up` runs what
`nx run-many -t docker:build` produced rather than building a second copy.

- **The build context is the repository, never the project.** The plugin's default is
  `docker build .` in the project directory, and `nx.json` overrides `cwd` to the workspace root
  because no application here declares a single third-party dependency: `@nestjs/core`, MikroORM and
  the rest live in the **root** `package.json`, and an app resolves them by walking up. An image built
  from `apps/posts-api` alone would have nothing to install.
- **The first stage exists to make the install layer cacheable.** It copies the whole repository and
  then extracts only the `package.json` files, the lockfile and `pnpm-workspace.yaml`; the next stage
  copies *that* and installs. A source change leaves the extracted manifests byte-identical, so the
  install layer survives it — and because the four Dockerfiles share those stages verbatim, the
  install happens once for all of them.
- **Nothing here deploys as an image**, and that is worth saying out loud: production is
  `sst.aws.Function`, a zip. These exist for `apps/web-e2e` and for bringing the system up without a
  toolchain, and they are the only packaging in the repository that no deploy consumes.
- **`apps/web`'s build depends on `^build`**, which it did not until the image needed it. `next build`
  typechecks against `@nestposts/*`, which resolve through their **`dist`** — so on a machine that
  had never run `pnpm build`, `nx build @nestposts/web` failed with
  `Cannot find module '@nestposts/auth/domain/auth/auth.service'`. It passed locally only because
  some earlier run had left the `dist` behind.

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
  (`eventStore: [Post]` in its `TransportModule`): what it
  ingests is appended to the aggregate's stream, the `Post` is replayed from it with `loadFromHistory`,
  and its own decision is appended and published. That is why it can decide about a Post without having
  a row for one — and why it also ingests `PostUpdated`/`Deleted`/`Restored`, which nothing there reacts
  to: a decision taken against half a history is a wrong decision.
- In the `apps/posts-api` suite the tagging step is **doubled in process**
  by `TaggingStandIn`, because eventual consistency makes an in-flight message cross the boundary of
  a test that truncates between cases. It lives in `apps/posts-api/test/support/` and the e2e
  registers it beside `AppModule` — **not** in `ApplicationModule` and not behind an environment
  variable, which is where it used to be. A stand-in that the application carries is a second path
  deciding a tag the application has no business deciding, and the flag that gated it was set in
  exactly one file in the repository: the e2e's own Vitest config. The real path is covered by
  `pnpm test:web`.
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
in an HTTP request — a field resolver inside a subscription's stream, a message arriving on a queue,
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
- **The migrator is a Nest container per database.** `apps/migrator/src/app/{posts,tagging}.module.ts`
  import the modules that own their tables, `bootstrap.ts` hands over `{ app, orm }`, and both the
  MikroORM CLI configs and the lambda handlers run on that. It is what lets `TestUsersSeeder` resolve
  the **real** `BETTER_AUTH` and create a credential rather than insert a password hash of its own.
  `DatabaseModule.forRoot({ exclusive: true })` is load-bearing there: the entity registry is filled
  when a module is **imported**, not when it is booted, so in the one process with two composition
  roots it already holds the union — and `tagging` would be handed `posts`' `auth_user`.
- **It depends only on the libraries**, never on the two applications — which is what keeps Yoga,
  Better Auth and the AMQP client out of whatever runs a migration, and what lets
  `apps/posts-api`'s e2e depend on the migrator for `DefaultTagSeeder` without a cycle.
- `dist/main.js` is a module as well as a script: `migrate()`, `seed()`, `setup()`.
  `apps/web-e2e`'s stack calls `node apps/migrator/dist/main.js setup` before starting either service.

### GraphQL edge

- **Fastify, not Express**, and **Yoga, not Apollo.** `apps/posts-api` runs on
  `@nestjs/platform-fastify` with `YogaDriver` (`@graphql-yoga/nestjs`), and Better Auth mounts its
  routes as middleware there. Both choices exist for the same reason: Fastify is what
  `@fastify/aws-lambda` can hand back as a **stream** (`payloadAsStream`, which is what
  `awslambda.streamifyResponse` and a Function URL need), and Yoga serves **subscriptions over SSE**
  on the same `/graphql` endpoint — a stream a Function URL carries, where a WebSocket upgrade dies
  at the load balancer. `@graphql-yoga/nestjs-federation` is the same driver when a subgraph is
  wanted.
- **Subscriptions are GraphQL-over-SSE**, in *distinct connections* mode: the client posts to
  `/graphql` with `Accept: text/event-stream` and gets one stream per subscription. The other mode
  reserves a stream with a `PUT` and attaches operations to it, which needs the same process to
  answer every request of that reservation — exactly what a function behind a load balancer cannot
  promise.
- **A subscription reads the `EventBus`, and the bus is what is event sourced.** A
  `@SubscriptionHandler` writes `this.eventBus.pipe(ofType(PostCreatedEvent))` — what `@nestjs/cqrs`
  already gives every application — and that works in one process or in twelve. With
  `subscriptions: true` on `TransportEventBusModule.forRoot`, the `EventBus` token is bound to
  `EventSourcedEventBus`, whose **observable side** is the `EventLog`. There is no port to implement
  and no option on `CqsrsModule`: the one that existed bought only "events from other containers",
  which the bus can carry itself. `POSTS_SUBSCRIPTION_SOURCE=feed` still picks it.
- **`@nestjs/cqrs` reads a bus three different ways, and the ORDER of boot is what separates them.**
  An `@EventsHandler` is bound to `subject$` **directly**, inside `bind()`; a saga is handed the
  observable **at registration**; everything else reads the observable whenever it pipes it.
  `EventSourcedEventBus` repoints `EventBus.source` at the log in `onApplicationBootstrap`, and
  `CqrsModule` — which `CqsrsModule` imports — bootstraps **first**: by then the handlers and the
  sagas hold `subject$` and keep it, so a projection runs once in the container that did the work
  and a saga dispatches once however many containers run. Only a `@SubscriptionHandler`, resolved
  per client long after boot, reads the log.
- **NEVER bind `EventBus` or `CommandBus` to a substitute provider. Decorate the instance.** It cost
  this repository two outages in one afternoon. `CqrsModule` registers every `@CommandHandler` and
  every `@EventsHandler` on the instance **it** resolves, and anything outside that module resolves
  a global override instead — so the handlers end up on one object and the publisher on another.
  With `CommandBus` that is `CommandHandlerNotFoundException`, which a saga swallows: the chain stops
  with nothing in the log. With `EventBus` it is worse, because everything looks healthy — the inbox
  logs `inbox ← posts.PostCreated#2.0.0 from 'tagging'` and the read model simply stays at version 1.
  `UnitOfWorkCommands` and `EventSourcedEventBus` both wrap what `moduleRef.get(...)` hands back.
- **The GraphQL error codes are ours now.** `@nestjs/apollo` mapped a Nest `HttpException`'s status
  to `extensions.code` inside the driver; Yoga does not, so `HttpExceptionFilter` does it explicitly
  (`UNAUTHORIZED → UNAUTHENTICATED`, `UNPROCESSABLE_ENTITY → BAD_USER_INPUT`, …). It is better where
  it is: a code a client branches on should not be a driver's implementation detail.
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

### Observability: what may not be bundled, and what has to load first

One trace covers the whole saga — `apps/web` → `apps/posts-api` → `apps/tagging` → back — and every
rule below exists because breaking it produces **no error at all**: the system works, the trace is
just wrong or absent, and only on AWS.

- **An instrumentation patches a module as it is `require`d, so anything it patches must not be
  bundled.** That is the whole reason `INSTALLED_PACKAGES` (`infra/aws/support/functions.ts`) exists,
  and why `pg`, `pino`, `@opentelemetry/instrumentation-pino` and the logs SDK are on it. The
  converse is accepted and worth knowing: `graphql`, `@nestjs/graphql` and `@nestjs/core` **are**
  bundled, so `GraphQLInstrumentation` and `NestInstrumentation` produce nothing on Lambda. They stay
  bundled because `@apollo/subgraph` must share the bundle's `graphql`, and because `@nestjs/core`
  external with `@nestjs/common` bundled is two halves of one DI container.
- **`startTelemetry` has to run before anything it instruments is loaded — including as a side
  effect of its own import.** `apps/*/src/telemetry.ts` imports
  `@nestposts/observability/telemetry`, **never the package barrel**: the barrel is
  `export * from './logging'` before `export * from './telemetry'`, and `logging.ts` imports
  `nestjs-pino`. Through the barrel, `pino` is in the require cache before the SDK exists, nothing is
  patched, and the deployed stack reports traces with **not one log line** beside them. For the same
  reason `import '../telemetry'` is the first statement of every Lambda entry point, ahead of
  `@nestposts/lambda`.
- **`@opentelemetry/api-logs` does not share the way `@opentelemetry/api` does.** `api` keeps its
  providers on a versioned `globalThis` symbol, so two copies still agree; `api-logs` keeps the
  provider in a module-level static, so a bundled copy and an installed copy are two registries that
  never meet and every record goes to a no-op logger.
- **The Lambda entry span is `@opentelemetry/instrumentation-aws-lambda`, registered by
  `infra/lambda/otel-preload.cjs` through `NODE_OPTIONS=--require`.** It cannot be a line in the
  application: that instrumentation patches the handler module named by `_HANDLER`, and here that
  module is the esbuild bundle — the very thing that starts the SDK. The preload travels beside the
  bundle exactly as `collector.yaml` does, and its own file carries the rest of the reasoning. The
  `--require` is added by the `NodeFunction` factory and **not** by `sharedEnvironment`, because that
  object is spread into `apps/web`'s Next server, whose artifact has neither the file nor the
  packages it requires.
- **A span that ends before the unit of work commits publishes nothing.** Outbound events are staged
  while a handler runs and only leave at `commit()`, so `ingesting()` in
  `libs/transport-eventbus/src/tracing.ts` wraps `UnitOfWork.run`, not the other way round.
  `injectTraceContext` writes `traceparent` from the **active** context; with no span active it
  writes nothing, and the next service opens a trace of its own.
- **`propagateContextUrls` has to name the URL the application actually calls.**
  `apps/web/src/instrumentation.node.ts` derives it from `API_URL`, which is the router's domain —
  not the function URL. A pattern that matches neither means the Next server never sends
  `traceparent` and the browser's half and the API's half are two unrelated traces.

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
| the whole system, in a browser | `pnpm test:web` (`apps/web-e2e`, **Playwright**) | **the packaged services over Inngest AND over real RabbitMQ**, driven through Chromium: signing in, being refused, the three states of `/posts/new`, the polymorphic `me`, a post read by someone who never signed in — and then what the browser cannot see, in the same test: each service's durable state, both inboxes, idempotency through the broker's management API, the replica channel, one correlation id across two processes, and the `x-tenant` **of the browser** on the headers of both events |

**`test-e2e` is the target name for every level of e2e there is**, in `apps/posts-api` and in
`apps/web-e2e`, which is the whole reason `pnpm test:e2e` can be `nx run-many` and reach both. A new
one is called `test-e2e` or that command does not know it exists — the same rule the CQRS handlers
follow. (`e2e` is not free: `@nx/playwright` infers a target and `nx.json` names it `e2e-ci`.) They run
`--parallel=1`, because both want the same Postgres and the same broker, and a suite that drops the
`posts` schema while another is reading it fails for a reason that has nothing to do with the code.

`pnpm test:web` runs the **same suite over both transports**, one after the other — Inngest first,
because it is the default, then RabbitMQ — and nothing is skipped in either. What differs is only
where a claim is checked, which `support/messages.ts` is: a queue bound to `posts.#` and drained
through the management API, or the dev server's own `/v1/events`. A test that could only be written
against one of them would be a test of the transport rather than of the system, which is what that
port exists to prevent.

It provisions everything itself, through **Testcontainers**: Postgres, the broker or the Inngest dev
server, the migrator as a one-shot, and then `posts-api` and `tagging` as the images
`apps/<app>/Dockerfile` build. They share a network and address each other by alias, so nothing has to be taught a port, and
what the host reaches is published wherever Docker likes — which is why the suite now needs no
configuration and does not care what else on the machine is holding 5432 or 5672. The one host port
chosen up front is the API's, by `FreePort`, because it signs cookies against its own origin and so
must know it before it boots. `apps/web` is the exception and stays a **process** (`next start`): it
is the thing under the browser, and an image between the test and it would only cost the `tail`.
There is no schema to rebuild and no queue to delete any more — the container is the clean slate. It
registers its two accounts — one promoted to `author` — through the web's own sign-up endpoint.
`apps/web-e2e/README.md` is the guide, including why everything shares one `AUTH_SECRET`.

Coverage excludes `index.ts`, `interfaces/`, `*.interface.ts` and `main.ts`; resolvers, mappers and
DTOs count.

## Gotchas

- **The Inngest SDK advertises the URL it was REACHED at, not the one it is reachable at.** A
  registration triggered from outside the network — a `PUT /api/inngest` from the host, say — tells
  the dev server the service lives at `localhost:<published port>`, which from inside the dev server's
  container is the dev server itself. Every run then sits in `Running` forever, with nothing in any
  log on either side, because the call goes somewhere that answers and is not the service.
  `serveOrigin` (or `INNGEST_SERVE_ORIGIN`) is what declares the truth, and both `docker-compose.yml`
  and `apps/web-e2e` set it to the address on their network.
- **`inngest/fastify` exports both `serve` and `fastifyPlugin`, and only one of them is a plugin.**
  `serve(options)` returns a route handler; handing it to `fastify.register` makes Fastify call it
  with its own instance, so the first request dies on `req.headers` being undefined and takes the
  process with it. `fastifyPlugin` is the one to register, with `{ client, functions, options }`.
- **Multiple triggers go in the CONFIG, not as a second argument.**
  `createFunction({ id, triggers: [...] }, handler)` — two arguments. The three-argument form takes a
  single trigger, and passing an array there is a compile error that reads as an arity mistake.
- **A page renders once, and an assertion on the DOM does not wait for the system.** `toBeVisible`
  repolls the DOM of a render that already happened, so a page navigated to before the saga closed
  shows version 1 until the timeout — and whether it does depends on the transport's latency, which
  made one assertion pass on RabbitMQ (~1s) and fail on Inngest (~330ms). The page is right: a fresh
  request serves the tag. `expect(async () => { await page.goto(...); ... }).toPass()` is the shape
  that waits for the system instead of for the browser.
- **RabbitMQ 4 refuses a transient non-exclusive queue.** `transient_nonexcl_queues` is deprecated
  and not permitted by default, so declaring `{ durable: false }` on a queue nobody holds
  exclusively answers `400` from the management API — and `apps/web-e2e`'s spy queue was exactly
  that. It passed for months because the suite reused whatever broker was listening, which on the
  machine it was written on was **another project's RabbitMQ 3.13**. The repository's own compose
  has said `rabbitmq:4-management` the whole time. A container per run is what made the two agree.
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
- **`MikroORM.init` resolves without ever reaching the server.** The pool is lazy, so an `init`
  against a dead port succeeds — and `isConnected()` answers `false` for a healthy server nobody has
  queried yet. Neither is an answer to "can I reach this database?"; only a statement is,
  `orm.em.getConnection().execute('select 1')`. The Vitest global setup
  (`libs/database/src/testing/postgres.ts`) chooses between the Postgres already listening and a
  throwaway container, and while it asked by initialising, the second branch **never ran once**. The
  bill came due when another project's Postgres took 5432: no container started, and every spec of
  the ten projects with `database: true` failed with
  `password authentication failed for user "nestposts"` — which reads like a credentials bug and is a
  port conflict. `testing/postgres.spec.ts` covers both branches. The same lie is why wrapping
  `MikroORM.init` in a retry did nothing for the Migrate lambda's `Connection terminated unexpectedly`.
- **`seeder.seedersList` is the registration, not the folder.** With it, `seeder:run` resolves classes
  from the config instead of globbing — a new seeder is added there or it does not exist, the same
  rule the CQRS handlers follow.
- **`migrations.migrationsList` is the same rule, and it was learned the expensive way.** `path` is a
  glob over the file system, and a **bundled** runtime has no such directory — so on Lambda the
  migrator found zero migrations, `up()` succeeded, and the first query answered
  `relation "posts.tags" does not exist`. Listed, they are imports: `src/migrations/posts/index.ts`
  and its tagging twin are the registration, and a migration missing from one does not exist for
  anybody, locally included.
- **An RDS Proxy is reachable long before it is usable.** `RegisterDBProxyTargets` returns at once
  and the target then spends minutes in `PENDING_PROXY_CAPACITY`, accepting the TCP connection and
  **closing** it. On the first deploy of a stage that is `Error: Connection terminated unexpectedly`
  at `pg-pool` in 141ms, from code that is correct — the same function migrated in three seconds six
  minutes later. Nothing retries it: re-run `sst deploy`, and no deploy after the first has the race
  to lose.
- **`_entities` is Apollo's own root resolver, so none of this repository's auth reaches it.** The
  global guard never sees it, and `__resolveReference` is a **property** resolver, whose enhancers
  come from `fieldResolverEnhancers` — which lists `interceptors` only, so guards do not run there
  either. The `@AllowAnonymous()` on the entity resolvers in `apps/posts-api/src/interfaces/graphql/`
  says what is true; it is not what makes it true. A subgraph's entity surface is reachable by
  anything that can reach the subgraph, which is why the router is the only place to put a policy.
- **`nodejs.install` as a LIST ignores the lockfile, and it deployed a different major version.**
  SST expands `install: ['a', 'b']` to `{ a: "*", b: "*" }` and runs an install inside the artifact,
  so every version is re-resolved at deploy time — and `*` does not select prereleases. That is how
  `better-auth-mikro-orm@1.0.0-next.2`, which this repository tests against, was deployed as
  **0.5.0**: a different major line whose adapter calls `metadata.has()` where MikroORM 7 wants
  `getByClassName()`. Nothing failed to boot. The first `/api/auth/*` request answered
  `Cannot find metadata for "AuthUser" entity`, **only on AWS**, and the local suites could not see
  it because they run the version in `node_modules`. `INSTALLED_PACKAGES` is now pinned through
  `InstalledPackages.pinnedTo`, which reads each version off the installed tree, so the deployed
  dependency is the tested one. Anything added to that list inherits the guarantee; anything added
  to SST's `install` by hand does not.
- **`@apollo/subgraph` must be BUNDLED, never external and never installed.** `@nestjs/graphql`'s
  federation factory `loadPackage`s it on every boot, so marking it external stops the application
  starting; installing it as a real file gives it a second copy of `graphql`, and a schema built by
  one `graphql` is not executable by another. `infra/aws/support/functions.ts` has the note.
- **`apps/web` keeps its own `federation.graphql`.** `_Any`, `_Entity` and `Query._entities` are
  added at runtime by `buildSubgraphSchema`, so they are not in the SDL codegen reads off disk — and
  they cannot be added to the API's own SDL either, because `buildSubgraphSchema` would then see
  duplicate definitions.
- **A seeder is not a migration, and the deploy treats them differently.** `Migrate` is invoked with
  `Date.now()` and runs every time; `Seed` is invoked with a **digest of
  `apps/migrator/src/seeders`** and runs when those sources change, because seeding writes rows a
  person may since have edited. `setup` deliberately does **not** seed users — `apps/web-e2e` runs it
  and then registers its own accounts through sign-up — so the deployed chain is `seed:deployment`.
- **`NODE_OPTIONS=--experimental-require-module` belongs to EVERY function, the Next server
  included.** AWS's managed Node runtimes do not do `require(esm)` on their own — measured on both
  `nodejs22.x` and the `nodejs24.x` that `sst.aws.Nextjs` hardcodes, while the very same OpenNext
  bundle loads fine under local Node 24. The failure is
  `ERR_REQUIRE_ESM: require() of ES Module @nestjs/core/index.js from .next/server/app/page.js`, and
  because `apps/web` boots a Nest container of its own it is a **500 on every page**. The web
  function drifted into it by listing its own environment instead of spreading
  `sharedEnvironment` (`infra/aws/compute/environment.ts`), which is why that object is exported and
  spread rather than copied.
- **Telemetry goes to Better Stack through the collector extension, and its destination is the
  `.env` at the root** — `BETTER_STACK_URL` and `BETTER_STACK_API_KEY`, which `sst deploy` loads by
  itself and `requiredEnv` refuses to default. The exporter's type in `infra/lambda/collector.yaml`
  is **`otlp_http`**, which is what the pinned layer's collector (v0.157.0) calls it — older ones
  know only `otlphttp` and refuse the file with `unknown type: "otlp_http"`. The name travels with
  the layer version, and an extension that cannot load its config does **not** fail the function, so
  the wrong one is a stack that deploys, serves traffic and reports nothing, forever. Whoever bumps
  `COLLECTOR_LAYER` checks it, in the function's log group: `Everything is ready.`
- **Telemetry is flushed by the collector extension, not by the handler.** `infra/lambda/collector.yaml`
  runs the OpenTelemetry collector beside each function: the SDK exports **each span as it ends** to
  `localhost` (`startTelemetry` picks that when `AWS_LAMBDA_FUNCTION_NAME` is set) and the
  collector's `decouple` processor lets the invocation finish while the export carries on. A
  `flushTelemetry()` per invocation would cost a round trip per request for the same result. The
  layer is only attached when an upstream endpoint is configured.
- **Logs are pino records, and they carry `trace_id` — which took three separate fixes to be true on
  AWS.** `loggingModule()` replaces Nest's logger and `PinoInstrumentation` joins the two halves, so a
  log line and the span it happened inside are one story. There is no correlation id of our own on a
  record — `trace_id` already is one. Everything about it is a load-order or a bundling question, and
  the Observability section above is the list; the short version is that `pino` must be installed
  rather than bundled, and `startTelemetry` must run before anything requires it. It cannot be tested
  under Vitest either: the instrumentation patches `pino` as it is **required**, and Vitest loads
  modules through a runner of its own. **The only place this is provable is a deployed stage**, by
  reading the collector's destination.
- **A command runs in a unit of work, and that is why there is nothing to drain.** `UnitOfWork`
  (`@nestposts/cqsrs`) is Axon's, in the shape this framework can have one. While a command handler
  runs, every `publish` is **staged**; when it returns, the staged events are appended to the
  `EventLog` (`prepareCommit`) and then published and forwarded (`commit`). It also **waits for what
  the publish set off**: `@nestjs/cqrs` drops whatever a handler or a saga returns, so
  `UnitOfWorkCommands` wraps `CommandBus.execute` and every discovered `@EventsHandler`'s `handle`
  to register their promises on the open unit. `EventIngestion.ingest` runs in a unit too, which is
  what makes `processSqsEvent` await the whole chain. Measured: before it, the deployed log ended one
  line after `was born untagged — completing it`, because Lambda froze the container mid-saga.
  A handler that throws rolls back and the events are **discarded**, where before they had already
  been published.
- **The unit of work is scoped to the REQUEST, which is what Axon scopes it to.** Axon's is
  `UnitOfWork<T extends Message<?>>` — it carries the message being handled — and here that message
  is the `AsyncContext` this repository already propagates, the same object `PostRequest.of(event)`
  answers with. `UnitOfWork.run(work, request)` joins an open unit only when the request **matches**:
  a saga dispatching with `request.attachTo(command)` commits as part of the same unit, while work
  carrying a different request — one that arrived from another service, say — gets a unit of its own
  rather than being committed as part of somebody else's. Unknown on either side means no evidence
  of a difference, and the unit is shared, which is what keeps a command dispatched without a
  context from starting one by accident.
- **`EventIngestion` decodes the request ONCE.** Decoding it in `ingest` and again in
  `ingestMessage` would make two `AsyncContext` objects for one message, and the unit would then not
  recognise the command a saga dispatches with the request it received — a unit of its own,
  untracked, and the Lambda freeze is back.
- **The handlers are found, not intercepted.** Wrapping `EventBus.bind` would be the obvious way to
  reach them and it is **too late**: `CqrsModule`'s explorer calls it during ITS bootstrap, before
  the importing module's. They are discovered through the `ModulesContainer` instead, which works
  after the fact because Nest's `bind` reads `handler.instance.handle` when the event is published,
  not when it binds.
- **`publishAll` copies the array it is given.** `AggregateRoot.commit()` hands it the aggregate's
  INTERNAL event array and then calls `uncommit()`, which empties it. Publishing straight away never
  noticed; a unit of work holds the events until its commit phase and finds the array cleared — the
  command succeeds, appends nothing and tells nobody.
- **Publishing after a unit has started committing goes out immediately.** A handler reacting to a
  committed event and dispatching a command of its own is new work, not a late addition to work that
  is already leaving — `UnitOfWork.staging` is the question, and Axon answers it by throwing
  (`Unit of Work is already committed`).
- **`context.callbackWaitsForEmptyEventLoop = false` in every Lambda handler.** Without it Lambda
  waits for the event loop to drain before finishing the invocation, and these applications hold a
  MikroORM pool, a transport client and OpenTelemetry's batch timers — so it never drains, every
  invocation runs to its full timeout, no warm container is reused and every request pays a cold
  start while being billed for the timeout.
- **SQS FIFO orders messages within a queue, not between queues.** A consumer that appends to an
  aggregate's stream therefore wants ONE queue: two events of one post arriving through two queues
  are two appends racing for the same sequence. `infra/aws/messaging/queues.ts` has the failure and
  the fix.
- **`batch: { partialResponses: true }` on the Lambda's event-source mapping** is what makes
  `batchItemFailures` mean anything. Without it AWS decides the whole batch by whether the invocation
  threw: throwing redrives the records that succeeded, and returning deletes the one that failed.

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
