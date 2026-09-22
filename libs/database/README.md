# @nestposts/database

The one door to MikroORM in this repository.

```ts
import { DatabaseModule, inRequestContext, postgresDatabase, valueObjectType } from '@nestposts/database';
```

`src/index.ts` also re-exports `@mikro-orm/core` whole, plus the three legacy decorators
(`@Transactional`, `@CreateRequestContext`, `@EnsureRequestContext`), so a file that needs an
`EntityManager` and a `defineEntity` reaches for one import instead of three. Direct
`@mikro-orm/core` imports elsewhere in the repository still work and were left alone: replacing them
is mechanical and belongs to whoever is already editing the file.

## What is in here, and what is deliberately not

| | |
|---|---|
| `config/database.config.ts` | `postgresDatabase(schema, options)` — the connection both applications and the migrator build on, and the one place that decides `ensureDatabase` |
| `database.module.ts` | `forRoot` (the connection) and `forFeature` (the tables a module owns), with the registry that makes the entity list lazy |
| `entities/value-object.type.ts` | `valueObjectType(PostId, { columnType })` — how a value object becomes a column |
| `helpers/request-context.ts` | `inRequestContext(em, work)` — a context for a path that did not start in an HTTP request |
| `filters/database-error.ts` | what a driver exception **means**: `DATABASE_EXCEPTIONS` and `databaseErrorCode` |

The rule for what belongs here is that it must be understandable without a domain. That is why:

- **soft delete's ORM half stayed in `@nestposts/platform`**, next to the rule it implements.
  `soft-delete.subscriber.ts` asks `SoftDeletion.isSoftDeletable(entity)` and
  `soft-delete-orm.entity.ts` maps the `SoftDeletion` embeddable — both need the platform's domain, and
  a package the platform depends on cannot depend on the platform back.
- **the GraphQL filter stayed in `apps/posts-api`**. It answers a foreign key violation with "o autor
  informado não existe ou não pode escrever", which is a sentence about *this* domain in *this*
  protocol. What moved here is the classification — `databaseErrorCode` turns the driver exception into
  `BAD_USER_INPUT` / `CONFLICT` / `NOT_FOUND` — and the filter decides what to say about it. Moving the
  whole thing would have made this package depend on `@nestposts/users` and on `graphql`, and
  `@nestposts/users` already depends on this one.

## `postgresDatabase`: one connection, one schema per service

```ts
export const mikroOrmConfig = (schema = process.env.POSTS_SCHEMA ?? POSTS_SCHEMA) =>
  postgresDatabase(schema, { subscribers: [new SoftDeleteSubscriber()], extensions: [SeedManager] });
```

Both services share one Postgres — `POSTGRES_URL` — and what separates them is the **schema**:
`posts` and `tagging`, each with its own tables and its own `mikro_orm_migrations`. It reads
`MIKRO_ORM_DEBUG`, validates what it got through `DatabaseConfigSchema`, and sets
`ensureDatabase: { create: false }`: the *database* is made sure of, the *schema* is not, because the
schema belongs to `apps/migrator`. A service whose migrations have not run fails with
`relation … does not exist`, which is the honest answer.

Anything after `schema` overrides what it decided, which is how the migrator adds its `Migrator` and
how a spec asks for `allowGlobalContext`.

## `testing/`: a schema is what `:memory:` used to be

`@nestposts/database/testing` is the other half, and it exists because Postgres has no in-memory mode.
`testDatabase(options)` gives a spec an ORM on a schema nobody else will pick, with its tables already
created, and `closeTestDatabase(orm)` takes both away. `TestSchemaModule.forRoot()` is the same thing
for a spec that boots Nest: it creates the schema on `init()` and drops it on `close()`, from
`beforeApplicationShutdown`, which is the last hook that still has a connection. `metadataOnly(entities)`
is for a domain spec that needs an ORM only so a `Collection` can find its owner's metadata.

`startPostgres()` is what the Vitest global setup calls: it uses the server already listening —
`docker compose up -d postgres`, or whatever `POSTGRES_URL` points at — and starts a throwaway
container when there is none. A project opts in with `database: true` in its `vitest.config.mts`; one
of pure domain rules leaves it off and needs no infrastructure at all.

**Native SQL has to say where the table is.** `tableIn(orm, 'posts')` qualifies a table with the
configured schema, because a raw statement is resolved against the `search_path` and not against the
connection's schema — which is a spec reading the column behind a mapping, and which is also why
`MikroOrmMessageInbox` asks the metadata for its own table name.

## `DatabaseModule`: the entity list is not a list

`forRoot(options)` is the connection. Every table reaches it through `forFeature(entities)` in the
module that **owns** it — `PostsInfrastructureModule`, `UsersInfrastructureModule`, `IdentityModule`,
`TransportEventBusModule` — and `forRoot` resolves the union of them **lazily**, in a factory.

Two measured failures are why it is not `autoLoadEntities`. The flag fills `entitiesTs` with only the
registered entities and MikroORM prefers that list under TypeScript, so the application's own entities
vanish and the symptom is `Cannot read properties of undefined (reading '__em')`. And Nest's own
registry is cleared when an application closes, so in a suite that boots a module per test the second
one comes up with `Metadata for entity User not found`. `database.module.spec.ts` covers both.

The registry behind `forFeature` is **process-wide**, which is worth knowing before writing something
that boots two different databases in one process: every `forFeature` ever called in that process is
in the union `forRoot` builds. `apps/migrator` passes its entities explicitly for exactly that reason.

## `tenancy/`: the tenant a request belongs to, and the entity manager that follows

`TenancyModule.forRoot()` is the whole wiring. It answers one question — *whose data is this request
about?* — and turns the answer into a MikroORM context, for every way into a service.

```
HTTP / GraphQL   ──▶  TenantMiddleware    ──┐
WebSocket / RPC  ──▶  TenantInterceptor   ──┴──▶  RequestContext.create(em of the tenant, …)
```

**Both halves, because neither covers everything.** Middleware runs before the guards, so an HTTP
request is already in the right entity manager by the time a guard reads the session or a pipe loads
an aggregate — but a message off a broker and a field resolved inside a subscription never pass
through Express at all, and `allowGlobalContext: false` refuses their first query. The interceptor
**defers to a context that already exists**, which is what makes running both safe: one request is
one entity manager, never two.

**The tenant is a name, not a schema.** `TenantSchemas` is the policy that turns one into the other,
and the default (`SharedSchemaTenants`) returns nothing at all: every tenant reads the connection's
own tables, the tenant still travels, still scopes the context and still shows up in the logs.
`SchemaPerTenant` is the other shape. Whichever is chosen, **no schema is created here** — DDL is
`apps/migrator`'s, so a policy naming a schema nobody migrated fails on the first query, which is the
same honest answer a service whose migrations never ran already gets.

**`normalizeTenant` turns `'undefined'` into the root tenant**, and that is not paranoia: a producer
that interpolates a missing tenant into a header sends the four letters rather than nothing, and the
far side then looks for a schema named after them. It is the kind of bug that surfaces three services
away from where it was caused.

**Where the tenant is read from is a token, and it takes three shapes.** `TENANT_RESOLVER` accepts a
plain `(context: ExecutionContext) => string`, a ready-made instance, or an injectable class — and a
class is **registered by the module itself**, so whatever it injects resolves from inside and nothing
has to be provided from outside:

```ts
TenancyModule.forRoot({ resolver: (context) => context.switchToHttp().getRequest().tenant })
TenancyModule.forRoot({ resolver: TransportTenantResolver })   // injects IncomingRequest
```

A token rather than an abstract class because the answer is usually one expression, and a class to
hold it would be ceremony. `HeaderTenantResolver` is the default and reads `x-tenant` off HTTP,
GraphQL and the RPC context; its `read(context)` is static, so `@CurrentTenant()` can use the same
rule with no injector to reach a resolver through. A message carries the tenant on the **envelope's
metadata** instead, and decoding that belongs to `@nestposts/transport-eventbus` — which is why
`TransportTenantResolver` lives there and this package knows nothing about envelopes.

**The schema itself is created by a trigger on the organization row** — `libs/auth` carries it, as a
MikroORM `trigger` emitted into a migration, so `tenant_<slug>` exists exactly as long as its
organization does. That is where `TENANT_SCHEMA_PREFIX` is shared from: the policy that routes queries
there and the trigger that creates it have to agree, and a rename that only half lands would route to
a schema nobody makes.

**What this package does NOT do is put the tenant on the wire.** That is the application's request
context: `PostRequest.toAttributes()` writes `x-tenant`, the codec rebuilds it, and the whole chain
is described in the root `README.md`. What crosses a broker is what the application calls a request,
and this package has no opinion about that.
