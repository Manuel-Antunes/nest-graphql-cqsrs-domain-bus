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
   repository, both `@ts-expect-error` in `src/validated-dto/mixins/validated-dto.mixin.spec.ts`.
3. **The in-house libraries** — `src/cqsrs` and `src/validated-dto` — may carry **JSDoc**, and only
   JSDoc (`/** … */`), as usage documentation of their public API. These two directories are
   general-purpose libraries that happen to live in this repository: their callers read the signature
   and the doc popup, not the implementation, so documenting what a type, option or method is for
   earns its keep. The rule still holds inside them for `//` and `/* */` comments, which must not be
   written, and for their `.spec.ts` files, which carry no comments at all. Everywhere else in `src/`
   — domain, application, infrastructure, interfaces — JSDoc is not an exception: those are
   application code, not a library API.

GraphQL `"""descriptions"""` in `src/graphql/*.graphql` are **not** comments — they are part of the
schema and are served through introspection and GraphiQL. Keep them. SDL `#` comments are comments;
do not write them.

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

Package manager is **pnpm** (pinned: `pnpm@10.28.0`).

```bash
pnpm install
pnpm start:dev                 # http://localhost:3000/graphql (GraphiQL + graphql-ws, same address)
pnpm build                     # nest build (copies src/graphql/**/*.graphql into dist/ as assets)
pnpm typecheck                 # tsc --noEmit — the only static gate (no ESLint, no Prettier)

pnpm test                      # unit: src/**/*.spec.ts
pnpm test:e2e                  # whole app over HTTP + WebSocket: test/**/*.e2e-spec.ts
pnpm test:all                  # both
pnpm test:cov:all              # combined coverage from both runners (--merge-reports)
```

A single file or a single test:

```bash
pnpm vitest run src/application/post/command/create-post.command.spec.ts
pnpm vitest run src/domain/post/post.entity.spec.ts -t "applying the same event twice"
pnpm vitest run --config vitest.e2e.config.mts -t "onPostUpdated"
```

Environment variables: `POSTS_DB` (default `data/posts.db`; e2e uses `:memory:`),
`MIKRO_ORM_DEBUG=true` (SQL in the log), `PORT`, `AUTH_URL`, `AUTH_SECRET`.

## Architecture

DDD/CQRS proof of concept: NestJS 12 + `@nestjs/cqrs` 12 + MikroORM 7 (SQLite) + `@nestjs/graphql` 14
(Apollo, **schema-first**). A TypeScript rewrite of `axon-graphql-posts` (Axon 5 + Spring GraphQL) —
the README carries the Axon → Nest translation table, which is worth reading whenever a choice looks
arbitrary.

### The module chain is the layer boundary

```
InterfacesModule (src/interfaces)  →  ApplicationModule (src/application)  →  PersistenceModule + IdentityModule (src/infrastructure)
```

Each module imports **only** the one below it, and `AppModule` lists just `InterfacesModule` — the
others arrive transitively, on purpose. A resolver cannot inject `PostRepository`: the ports are only
exported by `PersistenceModule`. Framework pieces (`CqsrsModule.forRoot()`, `MikroOrmModule`,
`AuthModule`, `GraphQLModule`, `AutomapperModule`) all live in `app.module.ts` and are global.

### CQSRS: the third message (`src/cqsrs`)

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
  (The README calls this method `filter`; in the code it is `match()`.)
- `subscribeAsAsyncIterable(bus, sub)` is the push→pull glue; it resolves pending `next()` calls with
  `done: true` immediately, which an `async function*` does not do — changing it reopens a leak of one
  subscriber per disconnecting client.

### A slice is one file, message and handler inside a `namespace`

`CreatePostCommand.CreatePost` and `CreatePostCommand.Handler` live in `create-post.command.ts`, with
the `.spec.ts` beside it. Same for `*.query.ts`, `*.subscription.ts`, `*.saga.ts`. **Every new handler
must be registered in `src/application/application.module.ts`** (the explorers scan the
`ModulesContainer`, not the disk).

### `PostRequest`: the request travels the whole chain

The edge creates `new PostRequest(postId)` and passes it to `commandBus.execute(command, request)`.
Command handlers are `{ scope: Scope.REQUEST }` + `@Inject(REQUEST)`, and stamp events via
`publisher.mergeObjectContext(post, this.request)`. The saga reads it back with `PostRequest.of(event)`
and forwards it with `request.attachTo(command)`. An `execute` without that context compiles, passes
the happy path and breaks the saga — hence the dedicated tests in `post-request.spec.ts`.

### The domain decides and evolves; the application orchestrates

Entities extend `WithAggregateRoot(WithSoftDelete(BaseEntity))`: decision methods
(`create`/`update`/`assignTag`) call `this.apply(event)`, which dispatches to the `on<Event>` handlers
— and those must be **idempotent**, because they are also the replay path (`loadFromHistory`). The
command handler loads through the repository, lets the domain decide, calls `save()` and **only then**
`commit()`. Sagas do not write: they dispatch commands.

### Every Zod schema lives in the domain module's `schemas/` folder

Inside `src/domain/`, a Zod schema is **never** written inline. Each domain module keeps its schemas in
its own `schemas/` folder, one file per schema, named `<thing>.schema.ts`, exporting a
`<Thing>Schema` const:

```
src/domain/post/
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

The same shape exists under `tag/`, `user/` and `shared/soft-delete/` (`SoftDeletionSchema`).

**Why the split.** A schema and a value object answer different questions, and used to be one
expression. The schema is a *value* — composable, reusable, narrowable (`PostTitleSchema.max(40)`),
and something a DTO or another schema can import without dragging in the class. The value object is
the *type* the domain speaks in. Inline, the rules were reachable only through the class that wrapped
them; extracted, they are a named export and `zod` enters the domain through exactly one door.

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
- **No barrel `index.ts`.** Import the specific file. `src/domain` uses direct file imports
  everywhere, and a barrel here would be the one thing that could turn the arrangement above into a
  real cycle.

Adding a value object is therefore two files: the schema, then the class that wraps it.

This applies to `src/domain/` only. The GraphQL DTO schemas under `src/dto/graphql/` are a different
layer with a different job (they carry `AUTOMAP_REGISTRY` decorator metadata) and stay where they are.

### Persistence: the domain carries no ORM decorator

The mapping lives in `src/infrastructure/persistence/sqlite/entities/*-orm.entity.ts`, via
`defineEntity({ class: Post, ... })`. Value objects become columns through
`valueObjectType(PostId, { columnType })`.

**A feature that spans layers gets a folder of its own in each layer it touches.** Soft delete is the
worked example: four pieces, two layers, and each layer keeps its half together instead of scattering
it across `entities/` and `helpers/`.

```
src/domain/shared/soft-delete/          ← the rule
  soft-delete.ts                        → WithSoftDelete (mixin), SoftDeletion (embeddable)
  already-deleted.exception.ts
  not-deleted.exception.ts
  schemas/soft-deletion.schema.ts       → SoftDeletionSchema

src/infrastructure/persistence/sqlite/soft-delete/   ← the mechanism
  soft-delete-orm.entity.ts             → activeFilter, softDeleteProperty, softDeleteIndex, ACTIVE_FILTER
  soft-delete.subscriber.ts             → swaps DELETE for UPDATE deleted_at
```

The four pieces are `SoftDeletion` (embeddable) + `WithSoftDelete` (domain mixin) + the `active`
filter (enabled by default) + `SoftDeleteSubscriber`. Specs sit next to what they cover, so the
filter and cascade tests live in the infrastructure folder. Note the nested `schemas/`: the folder is
a domain module in its own right, so the schema rule above applies inside it unchanged.

The ports are **abstract classes** in `src/domain/*/*.repository.ts` (they double as DI tokens) and the
adapters are bound in `persistence.module.ts`. Paths that do not originate in an HTTP request — a field
resolver inside a subscription (WebSocket), Better Auth hooks, tests — need
`inRequestContext(em, work)` (`src/infrastructure/persistence/request-context.ts`), otherwise the first
query is rejected.

### GraphQL edge

- **Schema-first**: the SDL in `src/graphql/*.graphql` is the source; resolvers bind by name
  (`@Resolver('Post')`, `@Query('posts')`, `@ResolveField('tags')`). No DTO carries a GraphQL
  decorator. A new field means a `.graphql` file + a resolver + registration in `interfaces.module.ts`.
- **DTOs and VOs come from Zod schemas** (domain schemas live in `schemas/` — see above):
  `ValidatedDto(schema)` + `@InheritValidatedMetadata()` for
  objects, `ValidatedDto.Scalar(schema)` for single-value value objects, `.Embeddable` for multi-value
  ones. `VO.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] })` is how a VO enters
  an already-decorated DTO shape.
- **No resolver calls the mapper** (except `createPost`, which needs the session author via
  `extraArgs`). Output leaves through interceptors: `MapInterceptor`,
  `ConnectionInterceptor(Post, PostView)`, `MapSubscriptionInterceptor(Event, View)`,
  `UserViewInterceptor` (the polymorphic dispatch behind `me`). Input arrives through `MapPipe`. Every
  mapping is declared in the AutoMapper profiles under `src/interfaces/mapper/`, with
  `valueObjectConverter(PostTitle, String)` per profile for the VO crossing.
- **Auth**: only `src/infrastructure/auth` knows about Better Auth; everything else talks to the
  `IdentityProvider` port. The global guard requires a session — post reads opt out with
  `@AllowAnonymous()`; writes use `@Roles([AUTHOR_ROLE])` + `@CurrentAuthor()` (which is `@Session()` +
  `SessionUserPipe` + `AuthorPipe`).
- **Errors**: `DomainExceptionFilter` (APP_FILTER) translates a domain exception into a `GraphQLError`
  with `extensions.code`; `MikroOrmExceptionFilter` (on the mutation resolvers) translates an integrity
  violation into `BAD_USER_INPUT`/`CONFLICT` without leaking driver messages.

## Tests

There is no fake repository: handler specs boot the real `CqsrsModule` and an **in-memory** SQLite
through `createCqrsTestingModule([...])` (`test/support/cqrs-testing-module.ts`), registering **only the
handler under test** — an accidental dependency between handlers breaks the test. The database proves
what was saved; `RecordingEvents` (attached to the `EventBus`) proves what was published. Because
handlers are request-scoped, tests dispatch through the `CommandBus` with a `PostRequest` — there is no
single handler instance to pull out of the module.

Coverage excludes `index.ts`, `interfaces/`, `*.interface.ts`, `main.ts` and the ORM config; resolvers,
mappers and DTOs count.

## Gotchas

- **`fieldResolverEnhancers: ['interceptors']` in `GraphQLModule` is not optional.** Without it the
  `@ResolveField` methods return the raw aggregate, and the symptom is a
  `Cannot return null for non-nullable field ...` that points nowhere useful.
- **MikroORM 7 and AutoMapper 9 are ESM-only**; the app runs as CommonJS through Node 22's
  `require(esm)`. Jest cannot do that — hence **Vitest + `unplugin-swc`** (Vite's esbuild does not emit
  `emitDecoratorMetadata`, which Nest's DI needs). The ORM decorators (`@CreateRequestContext`,
  `@Transactional`) come from `@mikro-orm/decorators/legacy`.
- **The build must stay on a non-bundling builder.** `nest build` uses `tsc`
  (`nest-cli.json` sets no `builder`/`webpack`). A bundler mangles class names and drops the
  `design:type` metadata AutoMapper reads, which silently breaks mapping at runtime while the build
  still succeeds.
- **TypeScript is pinned to `^6`**: 7 does not expose the programmatic API the Nest CLI uses.
  `tsconfig.build.json` needs an explicit `rootDir`.
- The `.graphql` files are **assets** copied by `nest-cli.json`; `typePaths` uses `__dirname` (so `src/`
  under Vitest, `dist/` in production).
- `@automapper/nestjs` 9 declares a peer of `@nestjs/*` 10/11 while the project is on 12 — the pnpm
  warning is expected.
