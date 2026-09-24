# migrator

The only thing in this repository that writes system DDL, the author of every tenant migration, and
the only thing that seeds. Its shape follows `tmp/migrator`: a system set and a tenant set of
migrations, a CLI config for each, and a generator that makes a tenant migration run in any tenant.

## The layout it migrates

One Postgres — `POSTGRES_URL` — laid out by tenancy, not by service. Every table is pinned by the
entity that maps it (`defineEntity({ schema })`):

| pin | schema | tables | migrations |
|---|---|---|---|
| `SYSTEM_SCHEMA` | `public` | Better Auth's (`auth_user`, `session`, `account`, the OAuth ones…) and the organizations' (`organization`, `member`, `invitation`, `team`…) | `src/migrations/system` |
| `TRANSPORT_SCHEMA` | `transport` | the transport's inbox and event log | `src/migrations/system` |
| `TENANT_SCHEMA` (`*`) | `tenant_<name>` | posts, tags, users, authors, notifications, deliveries, devices | `src/migrations/tenant` |

`tenant_root` is the root tenant — whoever names none. An organization is a tenant, `tenant_<slug>`:
the trigger on its row creates the schema and drops it `cascade`, and the applications migrate it
(`libs/database`'s `TenantEntityManagerService`). The `posts` and `tagging` schemas of the previous
layout are gone; services share tenants, and the transport's tables are one per system.

## Two configs, and the system always first

| config | target | writes into | ignores |
|---|---|---|---|
| `src/system-mikro-orm.config.ts` | `public` (and `transport`, pinned) | `src/migrations/system` | every other schema |
| `src/tenant-mikro-orm.config.ts` | `tenant_root`, the template | `src/migrations/tenant` | `public`, `transport` and every other schema; the system tables are skipped |

The tenant config rewrites every wildcard entity onto `tenant_root` (`discovery.onMetadata`, on the
discovery's own copy of the metadata) and generates through `TenantMigrationGenerator`
(`src/generators`), ported from `tmp/migrator`: every `"tenant_root"` in the diff becomes `${schema}`,
read at run time from the connection the migration runs on — **quoted**, because a slug may carry a
dash and `tenant_acme-corp` is no identifier unquoted — and a reference to a system table is pointed
at the system schema. One file therefore migrates `tenant_root`, `tenant_acme` and every tenant after
them.

`ignoreSchema` is enumerated from the live connection on every run: a development database
accumulates tenants, and a diff that saw them would emit DDL for somebody else's leftovers.

**The system migrations run before any tenant's**, always: `migrate()` is `migrateSystem()` then
`migrateTenants()`, and `migrateTenants()` provisions `tenant_root` and every `tenant_*` schema that
exists, through the same `TenantEntityManagerService` the applications use — so a deploy brings every
tenant up to date, and the service still migrates, on its first request, a tenant created after it.

The default tag is a tenant migration (`Migration…_default_tag`), not a seeder: the saga cannot complete
without it, and a tenant born at runtime — when its organization is — never runs a seeder.

## Where the entity list comes from

Nowhere in this app is a table or a column named. `app/connections.ts` composes the arrays the
modules owning those tables already export — `OrganizationEntities.withAuth()`, `postsEntities`,
`usersEntities`, `notificationsEntities`, `transportEntities`, `eventLogEntities` — and
`app/migrator.module.ts` imports those modules, exactly as an application does. The CLI configs boot
it, read the entity list off the container and hand back a plain config.

It boots Nest because `TestUsersSeeder` needs the **real** `BETTER_AUTH`: a seeded credential is one
Better Auth issued, with the hash its own version produces. What it does **not** import is an
application — `GraphQLModule` wants an HTTP adapter an application context does not create, and Yoga
and the AMQP client have no business in whatever runs a migration.

## Commands

Every command has a root-level script (`pnpm db:*`) and an Nx target; the targets take a
configuration:

```bash
pnpm db:setup                          # migrate (system, then every tenant), then the OAuth resources
pnpm db:migrate                        # the same without seeding
pnpm db:migrate:system                 # mikro-orm migration:up on the system config
pnpm db:migrate:tenant                 # mikro-orm migration:up on tenant_root only
nx run @nestposts/migrator:migrate:tenants     # every tenant_* schema
pnpm db:revert                         # migration:down, one step, tenant_root   (:system for public)
pnpm db:fresh                          # drop every tenant_* and the system tables, migrate, seed
pnpm db:seed                           # DatabaseSeeder, through the container
pnpm db:migration:create -- --name add-something          # a TENANT migration
pnpm db:migration:create:system -- --name add-something   # a SYSTEM migration
pnpm db:seeder:create -- --name SomeThing
nx run @nestposts/migrator:pending     # migration:pending, tenant (:system)
```

### Changing an entity

```bash
pnpm db:migrate                                  # the diff is taken against the live database
pnpm db:migration:create -- --name add-post-slug
```

Then **add the new class to `src/migrations/<set>/index.ts`** — see below — and migrate again. There
is no snapshot (`snapshot: false`): the diff is always against the live schema, which is why the
database has to be migrated before a migration is created.

### Compiled, and never TypeScript

Every target depends on `build` (`tsc`), and the CLI is pointed at `dist/*.config.js`, so nothing here
needs a TypeScript loader. `preferTs: false` is not decoration: MikroORM decides between `path` and
`pathTs` with `config.get('preferTs', Utils.detectTypeScriptSupport())`, Node 22+ reports
type-stripping support whether or not the code being run is TypeScript, and left to the default the
CLI would load sources whose extensionless imports Node cannot resolve.

## The migrations are a list, not a folder

`src/migrations/system/index.ts` and `src/migrations/tenant/index.ts` export the migrations **by
class**, and that list is what `migrationsList` receives. Creating a migration writes the file; adding
it to the list is what makes it exist — the same rule as `seedersList` and the CQRS handlers.

The reason is concrete: `path` is a glob over the file system, and a **bundled** runtime has no such
folder. On AWS the migrator once found zero migrations, `up()` succeeded, and the first query said
`relation "posts.tags" does not exist`. The Nest applications are the other case, by design: their
webpack build emits every tenant migration as a file of its own under `dist/migrations/tenant`, and
`TenancyModule` reads that folder — which is why a tenant migration must stay a plain `Migration` with
no import but `@mikro-orm/migrations`.

## Seeders

`DatabaseSeeder` is the deployment chain: `OAuthResourcesSeeder` (the gateway as a resource an OAuth
token may be issued for) and `TestUsersSeeder`. `seeder.seedersList` names every class explicitly.

`TestUsersSeeder` does **not** insert rows: it resolves `BETTER_AUTH` from the container, calls
`signUpEmail` and promotes the author through `IdentityProvider`. A seeder that resolves a provider
reaches the container through `seederContainer()`, because MikroORM constructs seeder classes itself;
run one through the MikroORM CLI and it says so.

**`setup` does not seed users**: `apps/web-e2e` runs `setup` and then registers its own accounts
through the web's sign-up endpoint, which is the path worth exercising. The deployed chain is
`seed:deployment`, which is what the `Seed` lambda runs.

## Running it somewhere else

`dist/main.js` is a module before it is a script:

```ts
const { migrate, migrateSystem, migrateTenants, seed, setup, fresh } = require('@nestposts/migrator');
```

Each function boots its container, does the work and closes it, so a Lambda handler is a call and a
`return`. As a script it takes the same names (`node dist/main.js migrate`), which is what the Nx
targets, the Docker image and `apps/web-e2e` use. `lambda.ts` exports `handler` (migrate) and
`seedHandler` (seed), and `infra/aws` gives each a function of its own.

The specs run against a DATABASE of their own (`testProject({ database: 'own' })`) and the real
`migrate()`: `migrations.spec.ts` asserts the layout above and that a second pass applies nothing,
`tenant-migration.generator.spec.ts` the rewrite a generated file goes through.
