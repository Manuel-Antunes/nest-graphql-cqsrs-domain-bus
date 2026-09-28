# @nestposts/event-store-mikro-orm

`@nestposts/transport-eventbus`'s event store on MikroORM and PostgreSQL: one table,
`transport.event_log`, and the engine that appends to it on condition and reads it back.

It knows nothing about the bus that appends to it. `@nestposts/transport-eventbus` defines the
`EventStorageEngine` port and speaks messages on top of it; this library is a table and the SQL over
it, and satisfies the port by its shape without importing it. The application is where the two meet —
at its root:

```ts
@Module({
  imports: [
    DatabaseModule.forRootAsync({ /* the connection */ }),
    MikroOrmEventStoreModule,                              // the table and the engine, global
    TransportEventBusModule.forRootAsync({
      /* identity, transactionManager, … */
      eventStore: {
        engine: MikroOrmEventStorageEngine,                // what every unit of work appends through
        entities: [{ entity: Post, tagKey: 'postId' }],
      },
    }),
  ],
})
export class AppModule {}
```

| | what | where it goes |
|---|---|---|
| `MikroOrmEventStoreModule` | the table and the engine | the application's root |
| `MikroOrmEventStorageEngine` | Axon 5's `EventStorageEngine`, with dynamic consistency boundaries | `TransportEventBusModule`'s `eventStore.engine` |
| `eventStoreEntities` | the table, for a connection that lists its entities itself | the migrator |

It depends on MikroORM and `@nestposts/database`, and on nothing of the bus.

## The table: one order, every tag

There are **no streams**. Each row is one event, in one global order, filed under every tag it
carries:

| column | |
|---|---|
| `position` | `bigserial`, the store's one order — read as a **string**, because the `pg` driver answers a bigint as one and a `number` would be a lie that works until `Number.MAX_SAFE_INTEGER` |
| `identifier` | the event's identifier, unique: an event the store already has is not appended again, so a redelivery costs nothing |
| `message_type` | `namespace.Name#version` |
| `payload` | the event's fields, encoded for JSON — a `Date` as `{ "@date": … }` |
| `metadata` | `jsonb`: what was said about the event when it was published — its correlation, the request, the tenant, the trace |
| `occurred_at` | when it happened |
| `tags` | `text[]` of `key=value`, with a GIN index (`event_log_tags_gin`): "every event carrying all of these tags" is an index lookup |
| `tenant` | the tenant whose entity manager the event was appended in |

**The metadata is kept** because an event read back is read by somebody who was not there when it was
published: a subscription served by another container, a replay a week later. It is Axon's metadata
beside every event, and it is where the trace a subscriber's delivery hangs off comes from.

**It says which tenant** because it is one store for every tenant, in the transport's own schema, and a
subscription must only hear its own tenant's events. A row whose metadata names no `x-tenant` is read
back with the tenant of its row.

It was the event log once — `stream_id`, `sequence` and a `trace_context` column, one stream per
aggregate. `Migration20260928120000_event_store_tags` (`apps/migrator`, a system migration) turned it
into this table: it adds `metadata` and `tags`, fills the metadata from the old trace context and the
tag from the old stream id and the payload property that carried it, drops the three columns and
creates the GIN index. Its `down` puts streams back, numbering each one's rows by position.

## `MikroOrmEventStorageEngine`

The engine the bus appends through, in the unit of work's transaction. What it owes is the port's, and
its spec (`mikro-orm-event-storage-engine.spec.ts`) holds it to it:

| | |
|---|---|
| `appendEvents(events, condition, transaction)` | writes through the unit's transaction — the `EntityManager` fork `MikroOrmTransactionManager` hands the unit — or in a transaction of its own when there is none. With a condition, it is refused, and answers `{ rejected: true, conflict }` with the first position that breaks it, when an event matching the condition's criteria was appended after its marker |
| `source(criteria, transaction)` | every event matching the criteria, in order: a criterion matches an event carrying **all** of its tags (`tags @> …`) and, when it names types, of one of them (the qualified name, without the version); the criteria match when any criterion does |
| `readAfter(position, limit, gaps)` | the global order after a position, and the positions in `gaps` again — what `EventSourcedEventBus` reads |
| `head()` | the last position written, `'0'` for an empty store — where a new subscriber starts |

### How a condition holds under concurrency

A condition is checked by a statement — "is there an event matching the criteria after the marker?" —
and a statement only sees what committed. Two units deciding on the same tags would each check before
the other committed, each find nothing, and both append. So **every append first takes a
transaction-level advisory lock per tag it involves** — the tags of its criteria and the tags of its
events — sorted, so two appends cannot deadlock on one batch. Whoever holds a tag's lock commits before
the next can check, and the check then sees it. The spec holds two transactions open by hand and
asserts the second waits, sees the first, and is refused.

A criteria that names no tag — "every event of this type", "every event" — cannot be locked by tag, so
it takes one lock over the whole store **exclusively**, and every append takes that same lock
**shared**: an ordinary append never waits for another, and a decision over the whole store waits for
everything in flight.

A marker is the position of the last event a read saw among those its criteria matched: an event
appended to those tags later has to wait for the lock, and gets a later position.

### Native SQL, and where the table is

Every statement is native, for the reason the outbox's are: `on conflict do nothing`, array containment
and advisory locks are not something an ORM's unit of work expresses. A native statement is not
resolved against the connection's schema either, so the table is read off the metadata — and a store
that is not mapped fails with a message saying to import `MikroOrmEventStoreModule` or to add
`eventStoreEntities` to the connection.

An array travels as a PostgreSQL array literal, every element quoted: MikroORM expands a JavaScript
array into a list of placeholders, so `?::text[]` handed an array is a syntax error.

## `MikroOrmEventStoreModule`

Global, like the bus that resolves the engine from it. It maps the table through
`DatabaseModule.forFeature(eventStoreEntities)`, the way every module that owns tables does, and
provides `MikroOrmEventStorageEngine`. A service that event-sources imports it; a service that does not
never maps the table — `apps/posts-api` imports it only when `POSTS_SUBSCRIPTION_SOURCE=feed`, which is
the one reason it has to read the store.

The migrator maps `eventStoreEntities` itself, beside `outboxEntities`, because the system migrations
are diffed from its entity list.
