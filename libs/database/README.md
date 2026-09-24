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

## `postgresDatabase`: one connection, and the schema every table is pinned to

```ts
export const mikroOrmConfig = () =>
  postgresDatabase(SYSTEM_SCHEMA, { subscribers: [new SoftDeleteSubscriber()] });
```

Every service shares one Postgres — `POSTGRES_URL` — and the connection points at `public`. What
decides where a table lives is the entity that maps it, `defineEntity({ schema })`, with one of three
pins:

| pin | lives in | |
|---|---|---|
| `SYSTEM_SCHEMA` (`'public'`) | `public` | Better Auth's and the organizations' tables |
| `TRANSPORT_SCHEMA` (`@nestposts/transport-eventbus`) | `transport` | the inbox and the event log |
| `TENANT_SCHEMA` (`'*'`) | `tenant_<name>` | everything else — MikroORM's wildcard: the schema of the entity manager a query runs on |

It reads `MIKRO_ORM_DEBUG`, validates what it got through `DatabaseConfigSchema`, and sets
`ensureDatabase: { create: false }`: the *database* is made sure of, the *system schema* is not,
because it belongs to `apps/migrator`. A service whose system migrations have not run fails with
`relation … does not exist`, which is the honest answer. Anything after `schema` overrides what it
decided. `DatabaseModule.forRoot` turns `@mikro-orm/nestjs`'s own request-context middleware off:
the context is `TenancyModule`'s to open, on the tenant's entity manager, and a second one opened on
the global manager would put every wildcard table in `public`.

## `testing/`: a schema is what `:memory:` used to be

`@nestposts/database/testing` is the other half, and it exists because Postgres has no in-memory mode.
`testDatabase(options)` gives a spec an ORM on a schema nobody else will pick, with its tables already
created, and `closeTestDatabase(orm)` takes both away. Every pinned table — system, transport,
wildcard — is rewritten onto that one schema (`everyTableIn`, a `discovery.onMetadata` on the
discovery's own copy of the metadata), so no two specs ever share `public`. `TestSchemaModule.forRoot()` is the same thing
for a spec that boots Nest: it creates the schema on `init()` and drops it on `close()`, from
`beforeApplicationShutdown`, which is the last hook that still has a connection. `metadataOnly(entities)`
is for a domain spec that needs an ORM only so a `Collection` can find its owner's metadata.

`startPostgres()` is what the Vitest global setup calls: it uses the server already listening —
`docker compose up -d postgres`, or whatever `POSTGRES_URL` points at — and starts a throwaway
container when there is none. A project opts in with `database: true` in its `vitest.config.mts`; one
of pure domain rules leaves it off and needs no infrastructure at all. `database: 'own'` also creates
a DATABASE for the run, and drops it after (`POSTGRES_OWN_DATABASE`): it is for the specs that use the
real layout by name — `public`, `tenant_root` — which a schema of their own cannot give them, and
which must never touch the development database `docker compose` publishes on the same server.

Which of the two it is costs a `select 1`. `MikroORM.init` resolves without reaching the server, so a
probe that only initialises says "already listening" to a dead port — and to **another project's**
Postgres holding 5432, which is how ten suites came to fail at once with `password authentication
failed`, a port conflict wearing a credentials bug's clothes.

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

## `tenancy/`: the tenant a request belongs to, its schema, and the entity manager that follows

`TenancyModule.forRoot({ migrations, resolver })` is the whole wiring. It answers one question —
*whose data is this request about?* — and turns the answer into a MikroORM context on that tenant's
schema, migrated, for every way into a service.

```
HTTP / GraphQL   ──▶  TenantMiddleware    ──┐
RPC (a message)  ──▶  TenantInterceptor   ──┴──▶  TenantEntityManagerService
                                                     .createAndMigrateTenantEntityManager(tenant)
                                                     ──▶  RequestContext.create(em on tenant_<name>, …)
```

**Both halves, because neither covers everything.** Middleware runs before the guards, so an HTTP
request is already in the right entity manager by the time a guard reads the session or a pipe loads
an aggregate — but a message off a broker never passes through HTTP at all, and
`allowGlobalContext: false` refuses its first query. The interceptor **defers to a context that
already exists**, which is what makes running both safe: one request is one entity manager, never two.

**A tenant is a schema: `tenant_<name>`**, and `tenant_root` for whoever names none
(`Tenant.schemaOf`). `TenantEntityManagerService` is `tmp/organization`'s service, in this
repository's shape:

- it forks `orm.em` with `{ schema }` — the wildcard tables follow it, the pinned ones do not;
- **the first time the process meets a tenant, it migrates the schema**: `MikroORM.init` with the
  connection's own options, `schema` set to the tenant's and the tenant `migrations` this module was
  given, `migrator.up()`, close. The migrator's tracking table lives in that schema too;
- the entity manager is then **remembered for as long as the process lives** — the promise, so two
  simultaneous first requests migrate once; a failure is forgotten, so the next request tries again;
- two PROCESSES meeting a new tenant at once are serialised by a transaction-level advisory lock on
  the schema's name: the second waits, then finds nothing pending;
- no snapshot is written: it would introspect the whole database and write a file into the bundle's
  directory, on a tenant's first request;
- **a schema that does not exist is not migrated** — only `tenant_root` and a schema its
  organization's trigger made are. Migrating on a header's say-so would let any caller create
  schemas by naming them; an unknown tenant's queries fail honestly instead, and a guard refuses it
  first (`libs/organizations`);
- `provision(tenant)` migrates now, whether or not a request has named it: what the organization
  plugin's hook gives a new organization, and what `apps/migrator` runs for every tenant on deploy.

**Where the migrations come from is the `TENANT_MIGRATIONS` token**, MikroORM's own `migrations`
option. An application bundle carries them as files, `{ path: join(__dirname, 'migrations', 'tenant') }`
— its webpack build emits one per migration of `apps/migrator`; a runtime with no directory to read
(the web, bundled by Turbopack; a spec under Vitest) passes `{ migrationsList }` instead, and a suite
overrides the token.

**`Tenant.normalize` turns `'undefined'` into the root tenant**, and that is not paranoia: a producer
that interpolates a missing tenant into a header sends the four letters rather than nothing, and the
far side then looks for a schema named after them. It is the kind of bug that surfaces three services
away from where it was caused.

**`Tenant.stamp(event, tenant)` / `Tenant.of(event)`** mark an object as belonging to a tenant, for
whoever has nothing else to tell it by: the transport's event log stamps every event it reads back
with the tenant its row was written in, and a subscription filters on it.

**Where the tenant is read from is a token, and it takes three shapes.** `TENANT_RESOLVER` accepts a
plain `(context: ExecutionContext) => string`, a ready-made instance, or an injectable class — and a
class is **registered by the module itself**, so whatever it injects resolves from inside and nothing
has to be provided from outside:

```ts
TenancyModule.forRoot({ migrations, resolver: (context) => context.switchToHttp().getRequest().tenant })
TenancyModule.forRoot({ migrations, resolver: TransportTenantResolver })   // injects IncomingRequest
```

A token rather than an abstract class because the answer is usually one expression, and a class to
hold it would be ceremony. `HeaderTenantResolver` is the default and reads `x-tenant` off HTTP,
GraphQL and the RPC context; its `read(context)` is static, so `@CurrentTenant()` can use the same
rule with no injector to reach a resolver through. A message carries the tenant on the **envelope's
metadata** instead, and decoding that belongs to `@nestposts/transport-eventbus` — which is why
`TransportTenantResolver` lives there and this package knows nothing about envelopes.

**The schema itself is created by a trigger on the organization row** — `libs/organizations`
carries it, as a MikroORM `trigger` emitted into a system migration, so `tenant_<slug>` exists
exactly as long as its organization does. That is where `TENANT_SCHEMA_PREFIX` is shared from: the
service that routes queries there and the trigger that creates it have to agree.

**What this package does NOT do is put the tenant on the wire**, nor decide who may name one. The
first is the application's request context: `PostRequest.toAttributes()` writes `x-tenant`, the
codec rebuilds it. The second is `TenantMembershipGuard`, in `libs/organizations`, because a tenant
is an organization and only that library knows what a member is.
