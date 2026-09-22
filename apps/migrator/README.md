# migrator

The only thing in this repository that writes DDL, and the only thing that seeds.

Before it existed, both applications created their own schema on boot — `ensureDatabase: { create:
true }` — and `apps/posts-api` carried a `DefaultTagSeeder` provider that ran on
`onApplicationBootstrap`. That works until the first column has to change on a database that already
holds rows, at which point the schema generator has no answer and the boot-time seeder has no ledger.
Both jobs now live here, as MikroORM's own `Migrator` and `SeedManager`.

## The two schemas

One Postgres — `POSTGRES_URL` — and a schema per service, which is what keeps one from reading the
other's tables by accident. They do not share a migration history either: each gets a config, a folder
of migrations and a `mikro_orm_migrations` table of its own, inside its own schema.

| config | schema | migrations | seeders |
|---|---|---|---|
| `src/posts-mikro-orm.config.ts` | `POSTS_SCHEMA` (default `posts`) | `src/migrations/posts` | yes |
| `src/tagging-mikro-orm.config.ts` | `TAGGING_SCHEMA` (default `tagging`) | `src/migrations/tagging` | **no** |

**A migration is bound to the schema it was generated in.** The emitted SQL is qualified —
`create table "posts"."account"` — so pointing `POSTS_SCHEMA` at another name does not move the
migration there. A throwaway schema is built from the entities (`TestSchemaModule`, in the suites),
never from the migrations.

`schemaGenerator.ignoreSchema` is enumerated from the live connection on every run, so every schema
that is not this config's own is invisible to the diff. Without it a leftover test schema is diffed
too, and `migration:create` emits `create schema`/`create table` for someone else's leftovers.

`apps/tagging` keeps no read model: the `posts`, `tags`, `users` and `authors` tables exist in its
database because it rehydrates a `Post` through their *mapping*, and they are meant to stay empty.
Its config therefore registers `Migrator` and not `SeedManager` — running a seeder against it is not a
mistake worth making convenient.

## Where the entity list comes from

Nowhere in this app is a table or a column named. Each config composes the arrays that the modules
owning those tables already export:

```ts
entities: [...postsEntities, ...usersEntities, ...betterAuthEntities, ...transportEntities]
```

`postsEntities` is the same constant `PostsInfrastructureModule` passes to `DatabaseModule.forFeature`,
`transportEntities` the same one `TransportEventBusModule` declares when `inbox` is on, and so on. A
new table reaches the migrator by being added to its own module's array — which is the edit that makes
it reach the applications too.

**Why this app does not boot Nest to discover them.** The obvious alternative is to start an
application context and read `orm.config.getAll().entities` back out. It cannot work here for two
reasons. `DatabaseModule` keeps its registry of declared entities in a **process-wide** `Set`, so
booting the `posts` graph and the `tagging` graph in one process — which `main.ts` does on every
`setup` — would hand the second database the first one's tables. And `apps/posts-api`'s `AppModule`
cannot be started as an application context at all: `GraphQLModule.forRoot` wants an HTTP adapter that
`NestFactory.createApplicationContext` does not create. Keeping this app free of Nest also keeps
Apollo, Better Auth and the AMQP client out of whatever is deployed to run a migration.

## Commands

Every command below has a root-level script (`pnpm db:*`) and an Nx target. The Nx targets take a
configuration, `posts` by default:

```bash
pnpm db:setup                    # migrate both databases, then seed — what `pnpm dev` runs first
pnpm db:migrate                  # migration:up, posts
pnpm db:migrate:tagging          # migration:up, tagging
pnpm db:revert                   # migration:down, one step, posts
pnpm db:fresh                    # drop, remigrate and seed, posts
pnpm db:seed                     # seeder:run, posts
pnpm db:migration:create -- --name add-something
pnpm db:migration:create:tagging -- --name add-something
pnpm db:seeder:create -- --name SomeThing
nx run @nestposts/migrator:pending            # migration:list
nx run @nestposts/migrator:pending:tagging
```

### Changing an entity

```bash
pnpm db:migration:create -- --name add-post-slug
pnpm db:migrate
```

The generated file lands in `src/migrations/<database>/` as TypeScript, and the build compiles it into
`dist/migrations/<database>/` — `migrations.path` is the compiled folder and `migrations.pathTs` the
source one. `.snapshot-*.json` lands next to the TypeScript, which is why it is a committed file: the
diff a colleague gets for the same entity change is the diff you got.

### Compiled, and never TypeScript

Every target depends on `build`, and the CLI is pointed at `dist/*.config.js`, so nothing here needs
`ts-node`, `tsx` or any other loader — which is also what the CLI's warning about `oxc`/`swc`/`tsx` is
about, and why it can be ignored.

`preferTs: false` is not decoration. MikroORM decides between `path` and `pathTs` with
`config.get('preferTs', Utils.detectTypeScriptSupport())`, and Node 22+ reports type-stripping support
whether or not the code being run is TypeScript. Left to the default, `seeder:run` would load the
**sources**, and Node's type stripping cannot resolve their extensionless relative imports:
`ERR_MODULE_NOT_FOUND` on a file that is plainly there.

## Seeders

`DatabaseSeeder` is the default chain, and it calls `DefaultTagSeeder`.

The default tag is not sample data. `CompletePostCommand` throws `TagNotFoundException` when the tag
the tagging decision names is absent, and `DEFAULT_TAG_ID` is a domain constant that `apps/tagging`
reaches for without ever asking `apps/posts-api` about it — so the row is a precondition for the saga
to complete at all. What makes it a seeder rather than a migration is that it is *data*: it is written
through the domain factory (`Tag.create`, with its events dropped by `uncommit()`) rather than as an
`insert` frozen into a migration file, and it is idempotent, so re-running it converges instead of
failing.

`seeder.seedersList` names both classes explicitly, so `seeder:run` resolves them from the config
instead of globbing a folder — **a new seeder is registered there or it does not exist**, the same rule
the CQRS handlers follow. `seeder:create` still writes into `src/seeders/`.

Seeders run in three places:

- `pnpm db:seed`, and `pnpm db:setup` after the migrations;
- anywhere holding a `MikroORM` instance, since both applications register `SeedManager`:
  `await orm.seeder.seed(DefaultTagSeeder)`;
- `apps/posts-api`'s e2e suite, which does exactly that — it runs against a schema built from the
  entities, and the seeding is an explicit line in `beforeAll` instead of a provider that fires on
  every boot in production.

## Running it somewhere else

`dist/main.js` is a module before it is a script:

```ts
const { migrate, migratePosts, migrateTagging, seed, setup } = require('@nestposts/migrator');
```

Each function opens its own ORM, does the work and closes it, so a Lambda handler is a call and a
`return`. As a script it takes the same names as arguments (`node dist/main.js migrate`), which is
what the Nx `setup` target and `docker/e2e/run.sh` use.

The build is `tsc`, not a bundler — the same rule as the two applications. MikroORM derives an entity's
name from its class, so a minifier that renames `Post` renames its table.

## What the applications still do

`ensureDatabase: { create: false }` is all they ask for: the database is made sure of, the schema is
not. If the migrations have not run, the first query fails with `relation … does not exist`, which is
the correct answer to that question and the reason the failure is not a table quietly appearing with
whatever shape the entities have today. The suites are the exception, and they build their schema from
the entities on purpose — see `libs/database/README.md`.
