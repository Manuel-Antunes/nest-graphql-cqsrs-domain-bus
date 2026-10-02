# `apps/gateway`

The one GraphQL endpoint a client talks to. It federates three subgraphs:

| subgraph | served by | what it owns |
|---|---|---|
| `posts` | `apps/posts-api` | posts, tags, users and their subscriptions (`onPostCreated`, `onPostUpdated`, …) |
| `notifications` | `apps/notificator` | notifications and devices, and `IUser.notifications` / `IUser.unreadNotificationCount` through `@interfaceObject` |
| `chatwoot` | `apps/chatwoot` (Rails) | contacts, conversations, inboxes and agents of the organization's support account, and `Client.contacts`, `Team.workingHours` / `Team.supportTeam` on the entities `posts` owns; its SDL is the dump `apps/chatwoot/schema.graphql` |

It composes the supergraph from the subgraphs' SDL, executes it — queries, mutations **and
subscriptions over SSE** — and forwards each caller's credentials to every subgraph an operation
reaches. It reads who is calling — a cookie session or an OAuth access token, through the same
Better Auth as every other process, from Redis first — to route the caller to the organization they
are in, and it never decides on a subgraph's behalf who may do what.

## Layout

Two folders: how the supergraph is built and executed, and how `@nestjs/graphql` serves it.

```
src/
  app.module.ts                  config, logging, error reporting, the database, Redis (when REDIS_URL
                                 is set), the Nest cache, Better Auth, and
                                 GraphQLModule.forRootAsync({ driver: YogaDriver, useClass: GatewayGqlOptionsFactory })
  config/                        app (port, subgraphs, CORS), redis — the database's and auth's
                                 are their libraries' own, registered by their modules
  supergraph/
    supergraph.ts                Supergraph: the subgraphs' SDL files → the supergraph SDL and the API schema
    federated-schema.ts          FederatedSchema.of(sdl): the supergraph → an executable, stitched schema
    interface-objects.ts         @interfaceObject, which the stitcher does not implement
    traced-executor.ts           a span per subgraph call, and where a subscription event came from
    supergraph-schema.controller.ts   GET /graphql/schema.graphql
    supergraph.module.ts
  graphql/
    gateway-gql-options.factory.ts    the GqlOptionsFactory: schema, CORS, plugins and the context
    gateway-context.ts           GatewayContext: the caller's Identity and what each subgraph is sent
    organization-slugs.ts        the active organization's slug, through the Nest cache
    gateway-graphql.module.ts    what the options factory injects
  infrastructure/persistence/    MikroOrmConfiguration: the system schema, and no tenant migrations
```

There is no port of its own and no module chain: the gateway has one way to build its schema and one
way to know who is calling, and the second is `libs/auth`'s — `IdentityResolver`, the same answer the
subgraphs' guards and `AuthService` give.

`GatewayGqlOptionsFactory` is `@nestjs/graphql`'s own `GqlOptionsFactory`, registered with `useClass`,
so everything Yoga is given comes from injected providers — including the **context function**, a
closure over `ModuleRef` and `OrganizationSlugs`. That is how DI and Yoga's per-request context work
together: Nest builds the objects once, Yoga calls the function once per request. `IdentityResolver` is
request-scoped, so the function registers Fastify's `req` under a context id of its own and resolves the
resolver for it — `ContextIdFactory.create()`, `registerRequestByContextId`, `moduleRef.resolve` — the
way the web's container resolves `AuthService`.

## The supergraph is composed from the subgraphs' own SDL

Both subgraphs are schema-first, so their `src/graphql/*.graphql` files ARE their SDL. The webpack
build (`webpack.config.js`, the shared `tools/webpack/nest-application.js`) copies them into
`dist/subgraphs/<name>` as assets — `scripts/subgraph-sources.mjs` is the one list of where each comes
from — so `nx serve` picks up a subgraph's SDL change like any other. The image and the Lambda bundle
carry the same directory. The gateway reads the system schema only — sessions, users, organizations —
and serves no tenant, so it is the one application whose bundle carries no tenant migrations.

`Supergraph` reads each subgraph's `.graphql` files and composes them with `@apollo/composition` — the composer Apollo's gateway and router use — so what runs is what
`rover supergraph compose` would print. **Nothing is introspected at boot**: introspection makes the
gateway's start wait on every subgraph, and on Lambda one cold subgraph cascades into a gateway that
answers 504 until both are warm. SDL files are build artifacts; composing them cannot cascade. Routing
still targets each subgraph's live URL, and a cold subgraph slows only the operations that reach it.

A schema-first subgraph's files are **merged**, the way `@nestjs/graphql` merges `typePaths`
(`mergeTypeDefs`), not concatenated: two files that each declare `type Mutation` are one type to Nest
and a composition error as text. A supergraph that does not compose stops the boot with every reason
composition gave (`SupergraphCompositionException`), instead of serving a schema that answers every
operation with a validation error.

`Supergraph.apiSchema` prints with `@apollo/federation-internals`' own printer, never
`graphql`'s: that package is CommonJS with its own `graphql`, and wherever `graphql` also loads as ESM
— Vitest, for one — the two are different realms and graphql-js refuses the other's types.

`nx run @nestposts/gateway:supergraph` writes `dist/supergraph/supergraph.graphql` and
`dist/supergraph/api.graphql`. The second is the schema `apps/web` and `apps/web-e2e` generate their
types from — their `codegen` targets depend on it — and `test/supergraph.spec.ts` fails the build when
the subgraphs stop composing. `GET /graphql/schema.graphql` serves the same API schema at runtime.

## Execution: a stitched schema, not Apollo's gateway

`YogaGatewayDriver` is `@apollo/gateway` behind Yoga: it starts an `ApolloGateway` and hands Yoga a
schema that stays empty until then. Apollo's gateway refuses to execute subscriptions, so putting SSE
in front of it changes the wire format and nothing about what can run. `FederatedSchema.of` builds the
executable schema with `@graphql-tools/federation`'s `getStitchedSchemaFromSupergraphSdl`, which
executes subscriptions — `federated-subscriptions.spec.ts` asserts every event of a federated
subscription reaching a `graphql-sse` client, in order. `GraphQLModule` runs it with the plain
`YogaDriver`.

## Credentials: what each subgraph is sent

Once per inbound request, the options factory's context function reads who is calling, inside a
MikroORM request context, and hands the stitched executor a per-request header resolution
(`SubgraphHeaderResolverFactory.build`). Each subgraph call then asks it for that subgraph's headers:

1. **`IdentityResolver` (`libs/auth`) reads who is calling**, from Fastify's `req`. It is Better
   Auth's `getSession`, so it reads both credentials the way every subgraph does: a cookie as a
   session, and an OAuth access token issued for this gateway as a session too (the
   `oauth-bearer-session` plugin, verified against the keys the jwt plugin keeps in Postgres). With
   `REDIS_URL` set, a cookie session is answered from Redis and costs no query at all (see `libs/auth`'s
   "Sessions in Redis"). A request with neither header costs nothing; one whose session cannot be read
   — a store that is down — is logged and answers `null`: the credentials are still forwarded, and each
   subgraph decides for itself.
2. **`OrganizationSlugs` names the organization the caller is in.** The identity carries the active
   organization's id; the slug — which is what `x-tenant` says — comes from `OrganizationRepository`
   through the Nest cache (`CacheModule` on the same Redis, `RedisCacheOptions`), five minutes a
   slug, so a busy caller costs one lookup per organization, not one per request. A slug renamed in
   between is routed by the old one for at most those five minutes.
3. **The headers are decided per subgraph, by a `SubgraphHeaderResolver`**
   (`supergraph/header-resolvers`). `DefaultSubgraphHeaderResolver` answers for every subgraph that has
   no resolver of its own: the credentials as they came (`RequestCredentials`, `libs/auth`: `cookie` and
   `authorization`) and `x-tenant` — the one the caller sent, or, when none came, the organization their
   session is in: the same rule the web's `/api/graphql` follows. A subgraph with rules of its own gets a
   resolver that extends it and names the subgraph (`ChatwootSubgraphHeaderResolver`, `chatwoot`), listed
   in `SubgraphHeaderResolverModule`. Each resolver runs at most once per request, however many calls its
   subgraphs receive, in a MikroORM request context of its own.

The headers are resolved inside the executor `onSubschemaConfig` wraps, and travel as the request's
`extensions.headers`, which `@graphql-tools/executor-http` merges into the outbound request:
`httpExecutorOpts.headers` is synchronous, and a resolver's Promise spread there is `{}` — every
subgraph would be called anonymously. The caller's own `extensions.headers` is replaced, never
merged, so nobody chooses what a subgraph is sent.

Trace context is deliberately **not** forwarded: the gateway's own HTTP instrumentation writes
`traceparent` on each outbound call, so a subgraph's span is a child of the gateway's (see Tracing).

Each subgraph authenticates the caller itself, through the same Better Auth instance it always had.
`subgraph-header-forwarding.spec.ts` boots the real `AppModule` in front of three subgraphs that report
what they received, one of them named `main-graph` and one `chatwoot`: the executor names a subgraph by
its `join__Graph` value (`MAIN_GRAPH`, `CHATWOOT`), so the resolvers are keyed by the subgraph's own
name, translated with `Supergraph.subgraphNamesOf` — keyed by the enum value, Chatwoot's resolver would
never be chosen and nothing would fail.

### An agent bot's token, exchanged for Chatwoot

A Chatwoot agent bot calls the platform with the access token its OAuth client was issued
(`chatwoot-agent-bot-<id>`, client credentials, `write:conversations`, bound to its organization and
carrying `agent_bot_id` — see `apps/chatwoot`'s `CreateAgentBotOauthClients`). The `IdentityResolver`
reads it as a `ClientIdentity` (`libs/auth`'s `AccessTokens`: verified once, against the jwt plugin's
keys, as an access token of this deployment), and no subgraph knows that caller: it has no user. For the
`chatwoot` subgraph, `ChatwootAgentBotTokens` exchanges it for the bot's own Chatwoot access token, sent
as `api_access_token` in place of `authorization`, so Chatwoot authenticates the bot the way its REST
API always has:

- the identity must be a client whose id is the bot's (`chatwoot-agent-bot-` + its `agent_bot_id`
  attribute, read through `ChatwootAgentBotTokens.AGENT_BOT_ID`), granted `write:conversations`, and
  bound to an organization — which a tenant the request names must be (`root` excepted);
- the token is read from `chatwoot.access_tokens`, for that bot in an account of that organization, and
  kept in the Nest cache under the platform token's `jti` (the identity's `credential.tokenId`) until
  it expires — so a rotated bot token stops being handed out once the platform tokens issued before it
  expire.

Whatever does not hold up is forwarded as it came, and Chatwoot answers it as nobody. The exchanged
token is a Chatwoot credential that does not expire, and while cached it sits in the Redis every
process shares.

### The gateway is an authorization server's origin too

`AuthInfrastructureModule` is installed with its routes: the gateway serves Better Auth's `/api/auth/*`
— the same instance, the same Postgres and Redis as every other process — and the authorization
server's discovery documents at the root, `/.well-known/oauth-authorization-server` and
`/.well-known/openid-configuration` (`OAuthDiscoveryController`, `libs/auth`: the plugin's own
documents, served where a client looks for them, since its handler only sees `/api/auth`). On AWS the
router sends both paths to the gateway, so the issuer's origin answers them; that is what the posts MCP
server (`apps/mcp`, Apollo MCP Server) and AgentCore's JWT authorizers discover the JWKS through.
Both bootstraps create the Fastify app with `bodyParser: false`, as posts-api does, so Better Auth
reads its own bodies. Emails it is asked for are only logged here — the gateway has no transport —
which is why the router keeps `/api/auth` itself on posts-api.

The MCP server forwards the caller's token, issued for it, to this gateway: every Better Auth process
lists the MCP server's resource in `AUTH_OAUTH_RESOURCES`, so its audience reads as a session here and
in every subgraph. `test/session-resolution.spec.ts` checks the discovery documents and a sign-in
through these routes; `test/mcp-operations.spec.ts` validates every MCP tool's operation against the
API schema this gateway composes.

### Why the identity is resolved in the context, and not by a guard

**No Nest guard runs on `/graphql` in this application.** `YogaDriver` registers its route directly on
Fastify (`app.all(path, …)`), not through Nest's router, and the stitched schema has no `@Resolver`
classes, so `@nestjs/graphql` has nothing to wrap with guards, interceptors or pipes. An `APP_GUARD`
here would guard `GET /graphql/schema.graphql` and nothing else — which is why `AuthInfrastructureModule`
is installed with `guard: false`. What does run for every operation is Yoga's
context function, so that is where the caller is resolved — with the same `IdentityResolver` the
subgraphs' tenant guard uses.

`test/session-resolution.spec.ts` is the proof, against a real Postgres (the
migrator's `migrate()`) and a Redis of its own: a cookie session routes the caller to their
organization, still does with its row deleted from Postgres, the slug lands in the Nest cache on that
Redis, and an access token signed by the jwt plugin reads as its user.

### Why the gateway's rules are not Yoga plugins

A Yoga plugin sees the operation the CLIENT sent — parse, validate, context, execute, the result. What
this gateway adds happens a layer below, on each call to a subgraph: which headers it carries, the span
around it, the `@interfaceObject` rewrite of the document it is sent. Yoga has no hook there; the
stitcher's own extension points — `httpExecutorOpts`, `onSubschemaConfig`, `onSubgraphAST` — are where
those rules live. What IS per client operation is a plugin or the context already: tracing and error
reporting are `useGraphQLTracing` and `useGraphQLErrorReporting`, and the caller is the context.

Hive Gateway (`@graphql-hive/nestjs`'s `HiveGatewayDriver`) is the one runtime whose plugins reach
subgraph calls (`onSubgraphExecute`, `onFetch`) and that runs `@interfaceObject` itself. It was
weighed and left out: it brings the whole `@graphql-hive/gateway` CLI package — some sixty
dependencies, OpenTelemetry exporters of its own among them — declares Nest 10–11 and
`@nestjs/graphql` 12–13 as its peers, and registers a catch-all Fastify route.

## Tracing

Every subschema executor is wrapped by `TracedExecutor.wrap`: one client span per call to a subgraph,
`subgraph posts`, with `graphql.subgraph.name` and the operation's type and name. The HTTP request
runs inside it, so the `traceparent` it carries makes the subgraph's work a child of that span, and a
gateway trace reads as a query plan. A subscription's span lasts as long as its stream.

The subgraph's own events carry the trace they were delivered in (`extensions.traceparent`, which
`useGraphQLTracing` writes), and the executor remembers it for the objects of each event's `data`.
`TracedExecutor.originOf(payload)` answers it, and `GatewayGqlOptionsFactory` hands it to
`useGraphQLTracing({ resolvers: false, originOf })`, so the gateway's delivery continues the same
trace. The subscription's events are passed through by a hand-written iterator, not an
`async function*`: a generator serializes `return()` behind a pending `next()`, and a client that went
away would leave the subgraph's stream open until its next event.

The spans are `@opentelemetry/api` only — a no-op until `src/telemetry.ts` starts the SDK.
`traced-executor.spec.ts` drives a stitched gateway against a subgraph that stamps its events.

## `@interfaceObject`

A subgraph may contribute fields to an entity **interface** without knowing its implementations —
it keeps an id and nothing else. `@graphql-tools/federation` implements none of it: no published
version mentions `isInterfaceObject`, nothing fails at composition, and the contributed field simply
has no resolver — a non-null one takes its whole parent down.

`InterfaceObjects` reproduces what Apollo does:

- `apply` makes every implementation an entity of the contributing subgraph under the same key, and
  pins the fields each implementation already had to the graphs that owned them — a field with no
  `@join__field` means "every graph declaring the type serves it", and without the pin it silently
  claims the new graph too (measured as `Unknown type: "Address"` when a type only one subgraph knew
  leaked into another's schema);
- `implementationTypeDefs` gives the contributing subgraph the implementation types it never
  declared, so the stitcher plans fetches for them;
- `keyFn` builds the representation under the **interface's** `__typename` — the only name the
  contributing subgraph knows — wrapping the key function the library derived, which already projects
  nested and compound keys;
- `rewriteTypeConditions` rewrites `... on Author { … }` into `... on IUser { … }` in the document sent
  to that subgraph, which would otherwise reject it with `Unknown type "Author"`.

`@requires` travels with the contributed field and is resolved by the library's existing machinery.

More than one subgraph may treat the same interface as an `@interfaceObject`: `chatwoot` declares
`IUser` as one only to point at it, and contributes nothing. `collect` makes a mapping of every such
subgraph that contributes a field and `apply` applies them in turn — it used to read the first join
only, which is Chatwoot's alphabetically, find no field there and drop `IUser` altogether, and
`me { notifications }` stopped resolving with nothing failing (`test/supergraph.spec.ts` covers it).

One case is **not** handled: a contributing subgraph that hands out bare references to the interface
(`recipient: IUser`) whose id the owning subgraph cannot resolve. The owner's `_entities` answers
`null`, no concrete `__typename` replaces the interface's, and graphql-js cannot complete the abstract
value — which nulls every non-null ancestor rather than the one field. It needs a one-line fix in
`@graphql-tools/delegate`'s `resolveExternalValue` (null an abstract value whose resolved type is not
an object type). A subgraph here that only **contributes** fields, and never returns the interface,
never meets it. `chatwoot` does return one, `Agent.user`, for an agent whose platform user the
`posts` subgraph no longer knows; the field is nullable, so the case costs that field and nothing
above it.

## Environment

| variable | default | |
|---|---|---|
| `GATEWAY_PORT` / `PORT` | `4000` | |
| `GATEWAY_URL` | `http://localhost:4000/graphql` | this gateway as a resource — the audience an OAuth access token must carry |
| `POSTS_SUBGRAPH_URL` | `http://localhost:3000/graphql` | |
| `NOTIFICATIONS_SUBGRAPH_URL` | `http://localhost:3002/graphql` | |
| `CHATWOOT_SUBGRAPH_URL` | `http://localhost:3100/graphql` | |
| `GATEWAY_SUBGRAPHS_DIR` | `dist/subgraphs` beside `main.js` | where the baked SDL is read from |
| `GATEWAY_CORS_ORIGINS` | `WEB_URL`, then `http://localhost:4200` | the browser calls the gateway cross-origin for SSE |
| `POSTGRES_URL` | `postgresql://nestposts:nestposts@localhost:5432/nestposts` | the system schema: sessions, users, organizations, the jwt plugin's keys |
| `REDIS_URL` | unset | Better Auth's sessions and the Nest cache; unset, sessions are read from Postgres and the cache is in memory. The same one every Better Auth process uses |
| `AUTH_SECRET`, `AUTH_URL`, `AUTH_ISSUER`, `WEB_URL` | as in `libs/auth` | the same Better Auth configuration as every other process — the secret most of all, or no cookie verifies |
