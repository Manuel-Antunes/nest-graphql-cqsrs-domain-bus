# `@nestposts/graphql-response-cache`

GraphQL response caching for a Yoga server, stored in the Nest cache manager: `@graphql-yoga/plugin-response-cache`,
with a store that lives wherever the application's `CacheModule` does — Redis, shared by every process,
when there is one; memory otherwise.

```ts
@Module({
  imports: [
    CacheModule.registerAsync({ isGlobal: true, useClass: RedisCacheOptions }),
    GraphQLModule.forRootAsync<YogaFederationDriverConfig>({
      driver: YogaFederationDriver,
      imports: [GraphQLResponseCacheModule],
      inject: [GraphQLResponseCache],
      useFactory: (responseCache: GraphQLResponseCache) => ({
        typePaths: [join(__dirname, 'graphql', '**/*.graphql')],
        plugins: [
          useGraphQLTracing(),
          useGraphQLErrorReporting(),
          responseCache.plugin({ session: RequestCredentials.keyOf }),
        ],
      }),
    }),
  ],
})
export class AppModule {}
```

## Why not Nest's `CacheInterceptor`

Nest's own documentation says it: in a GraphQL application interceptors run once per field resolver,
so the `CacheModule`'s interceptor does not cache a response — it caches whatever one resolver
returned, keyed by an HTTP URL every operation shares. A response cache belongs to the server that
executes the operation, which is what Yoga's plugin is; this library gives it the cache manager as its
store.

## Nothing is cached until the schema says so

The global TTL is zero. A type or a field opts in, in the SDL, next to what it describes:

```graphql
type Post @key(fields: "id") @cacheControl(maxAge: 60) {
  id: ID!
  title: String!
}

type Event @cacheControl(maxAge: 60, scope: PRIVATE) {
  id: ID!
}

type Query {
  me: IUser! @cacheControl(maxAge: 0)
}
```

A response lives as long as the SHORTEST `maxAge` among what it selected, so `maxAge: 0` on a field
keeps every response that selects it out of the cache, whatever else it selects.

`maxAge` is in seconds, and nothing is kept longer than an hour. The directive has to be DEFINED in the schema for the plugin to read it —
each subgraph carries it in `src/graphql/cache-control.graphql`.

## Whose a cached response is

The key is the operation, its variables, the caller and the tenant:

- **the caller is what the application's `session` answers** — a string, or `null` for nobody. The
  library cannot know who a caller is, so `plugin({ session })` requires it. posts-api and the
  notificator pass `RequestCredentials.keyOf` (`@nestposts/auth`): the `cookie` and the
  `authorization` the request sent, read without resolving them. A response is never served to a
  caller that did not send the same credentials, so everything an authenticated caller reads is
  cached for them alone.
- **A caller answered `null` has no session**: `PRIVATE` is not cached for them at all, and `PUBLIC`
  is shared by every anonymous caller.
- **`x-tenant` is in every key**, anonymous or not: no tenant ever reads another's response.

## What a response is recorded under — and what that means for a list

The plugin records the **objects that carry an `id`** in a result (`Post:<id>`), and, for a field that
came back null or empty, the TYPE it would have held. A connection, an edge, anything without an `id`
is not recorded at all. So a list is invalidated only through the posts it contains: a post that
APPEARS is in none of them, and what reaches every list — the new member, the new `totalCount` — is
the type, `invalidate([{ typename: 'Post' }])`. A null `post(id)` is recorded under the type as well,
which is how a post created or restored after somebody asked for it stops answering null.

## When a cached response is forgotten

- **When a mutation returns an entity it contains** (`__typename` + `id`), in this process or in any
  other that shares the cache: the invalidation is a write to the shared store, not to a process's
  memory. The plugin does it WITHOUT awaiting it, after the result is built — a client that refetches
  the instant the mutation answers can still read the old response. What must be invalidated before
  the answer is the application's, below.
- **When code says so**: `GraphQLResponseCache.invalidate([{ typename: 'Post', id }])` for one entity,
  `[{ typename: 'Post' }]` for every response that selected the type. That is the door for a change
  that is not a mutation of this schema — a saga's, another service's, a projection's — which the
  plugin cannot see.
- **When its TTL runs out**, which is the only thing that catches a change nobody reported. Choose
  `maxAge` for that case.

The store invalidates by VERSION: a response is stored with the version of every type and entity it
contains, and served only while they all still hold; invalidating replaces a version, one write. No
list of responses is kept per entity, so two processes invalidating at once cannot lose each other's
write, and nothing is scanned.

**A change settles for five seconds** (`SETTLE_MS`) before anything containing it is cached again: a
version carries the moment it was replaced, and a response that contains something replaced more
recently is served but not stored. It closes the race every store of `@envelop/response-cache` has —
a query that read before the change and finishes after the invalidation would otherwise be stored
under the NEW version, and served stale until its TTL (`graphql-response-cache.spec.ts` holds a
resolver open across an invalidation to prove it is not). It is also what makes invalidating INSIDE
the transaction that makes the change safe: whatever runs between the invalidation and the commit is
not cached.

**The cache failing never fails a request.** The plugin calls `set` and `invalidate` without awaiting
them, and an unhandled rejection ends a Node process; the store catches and logs everything, and a
`get` that fails is a miss.

## What is cached today, and who forgets it

`apps/posts-api` opts in `Post` (60 s), `Tag` (300 s) and `Event` (60 s, `PRIVATE`: what a caller sees
of the calendar depends on who they are), and opts `me` OUT (`maxAge: 0`), because its type and its
profile change through Better Auth, where nothing invalidates. Its
`interfaces/graphql/response-cache-invalidation.handler.ts` forgets them from the domain events —
the one post a completion or an edit changed, every response with a post when one is created,
deleted or restored, and the same for calendar events — as a **subscribing** processing group with a
`LoggingErrorHandler`: inside the unit that makes the change, so the invalidation has happened before
a GraphQL subscription hears of it and before a mutation answers, and a Redis that is down is logged
instead of failing the command. A change that arrives from tagging is ingested, and invalidated, the
same way.

What is left to the TTL: an author's name and email inside a post (changed through Better Auth), and
a calendar's visibility when somebody's role in the organization changes.

The notificator installs the plugin and caches nothing: its answers are one user's, change with every
delivery, and its count is a scalar — nothing an entity can invalidate.

## Where it is installed

In the subgraphs — `apps/posts-api` and `apps/notificator` — and not in the gateway. The types and
their `@cacheControl` live in the subgraphs' SDL, which composition does not carry into the
supergraph, and a mutation is executed, and invalidates, in the subgraph that owns the entity. The
gateway still gains from it: each subgraph call it makes for a cached selection is answered from the
cache.

Every query costs one cache read, even when nothing in the schema asks to be cached — the plugin cannot
know an operation's TTL before executing it.
