# @nestposts/outbox-mikro-orm

[`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox) on MikroORM and PostgreSQL: the store the
package leaves to the application, the tables it keeps, and the transaction manager a unit of work
runs in.

It knows nothing about the bus that writes to the outbox. `@nestposts/transport-eventbus` uses what this
library provides, and the application is where the two meet — at its root, where every one of them is
declared:

```ts
@Module({
  imports: [
    DatabaseModule.forRootAsync({ /* the connection */ }),
    OutboxModule.forRootAsync({                         // @nestjs/outbox: transports, route, relay, retry
      imports: [PostEventsClientModule],
      transports: PostEventsClient.destinations(appConfig()),
      inject: [appConfig.KEY, outboxConfig.KEY],
      useFactory: (app: AppConfig, { relay, pollInterval, retry }: OutboxConfig) => ({
        route: PostEventsClient.route(app),
        relay: { enabled: relay === 'poll', pollInterval },
        retry,
      }),
    }),
    MikroOrmOutboxModule.forRootAsync({                 // its store, and the three tables
      inject: [appConfig.KEY],
      useFactory: ({ name }: AppConfig) => ({ producer: name }),
    }),
    TransportEventBusModule.forRootAsync({
      /* identity, … */
      transactionManager: MikroOrmTransactionManager,    // what every unit of work runs in
      inbox: { descriptions: MikroOrmOutboxStore },      // what each admitted message was, and from whom
    }),
  ],
})
export class AppModule {}
```

## `MikroOrmOutboxModule`

`@nestjs/outbox` configures no store: a provider of the application's registers one with
`OutboxStorage`. This module is that provider. It builds a `MikroOrmOutboxStore` for the `producer` it
is given, registers it for both of the package's contracts — the messages with their dead letters, and
the inbox — and maps its three tables through `DatabaseModule.forFeature`, the way every module that
owns tables does:

| table | what |
|---|---|
| `transport.outbox_messages` | a message the service committed to publish and has not published yet |
| `transport.outbox_dead_letters` | a message the relay gave up on, with every attempt it made |
| `transport.outbox_inbox` | which consumer processed which message, and — this repository's columns — what it was and who produced it |

It is global, like the `OutboxModule` it serves, and needs that module and the MikroORM connection.

**It prunes nothing, and runs nothing on a timer.** A message leaves `outbox_messages` when the relay
publishes it or dead-letters it, and a dead letter stays until `@nestjs/outbox`'s `OutboxDeadLetters`
requeues or purges it. The inbox is forgotten from outside: `apps/migrator`'s `migrate()` ends with
`pruneInbox()`, which deletes from `OutboxInboxRecord`'s table (`OutboxInboxEntitySchema`,
`@nestposts/outbox-mikro-orm/outbox.entities`) every row processed longer ago than
`INBOX_RETENTION_DAYS` — one statement for every consumer, on every deploy and every `setup`.

**The store is scoped by producer.** One `transport` schema (`TRANSPORT_SCHEMA`, `@nestposts/database`)
serves every service, and a relay may only publish what its own service produced: the destinations a
message is sent through are the producer's transports, and another service has none of them. Every
message and dead letter carries the producer's name, and the store reads and writes only its own. The
inbox is not scoped, because its key already names the consumer.

**It is native SQL**, because the rules are conditional writes and row locks, which a statement can
express and an ORM's unit of work cannot: an advisory lock per key in the writer's transaction, so a
key's rows are numbered in commit order; claims with `FOR UPDATE SKIP LOCKED`, never a key's row ahead
of an older one; every relay write fenced by the lease owner; `on conflict do nothing` for the inbox.
The tables are read off the metadata, because a native statement is not resolved against the schema an
entity is mapped to. It passes `@nestjs/outbox/testing`'s contract suites with their concurrency cases
on (`mikro-orm-outbox.store.spec.ts`).

A transaction handle (`Tx`, in `@nestjs/outbox`'s terms) is the `EntityManager` of an open
transaction: the fork `em.transactional` hands its callback, or the global one while that transaction
is its context. Anything else is refused with `OutboxTransactionRequiredError` — writing outside the
caller's transaction would be the dual write the outbox exists to remove.

## `MikroOrmTransactionManager`

The transaction a unit of work runs in, on MikroORM — `transport-eventbus`'s `TransactionManager`,
Axon 5's port, which it satisfies by its shape without importing it. The application hands it to the
bus: `transactionManager: MikroOrmTransactionManager`.

**`em.transactional`, decided later.** A unit opens its transaction in `PRE_INVOCATION` and commits it
in `COMMIT`, three phases apart; a MikroORM transaction is a callback. So the callback is started and
left waiting on the unit's decision: `commit()` lets it return — MikroORM flushes and commits — and
`rollback()` makes it throw. Everything else is MikroORM's own: the fork is the transaction's `handle`
— the `Tx` the outbox, the inbox and the event store write through — and `run(work)` enters its
`TransactionContext`, which the unit does around every phase action, so every `EntityManager` a handler
injects resolves to it.

**An open transaction is joined, as a savepoint**, exactly as a nested `em.transactional` would join it
— which is Axon's JPA manager joining the thread's transaction. That is what a command a saga
dispatches inside an ingestion gets: a unit of its own, whose writes commit with the ingestion's or not
at all.

**After-commit work waits for the transaction that owns it.** `afterCommit(callback)` only queues
`callback`. A transaction that joined another hands its queue to that one when it commits — its own
commit only releases a savepoint — and drops it when it rolls back; the transaction that owns the
connection runs the queue in `runAfterCommit()`, which the unit that opened it calls in its
`AFTER_COMMIT`, outside the transaction's scope. A callback that fails is logged, and the commit
stands. The queue used to run inside `commit()`, and that was measured to fail: it ran in the committed
fork's `TransactionContext`, and a drain that delivered synchronously to another unit joined a
transaction that was already over — `Transaction is already committed`.

**`detached()` is the same with `REQUIRES_NEW`**, for a publish that nobody awaits inside the caller's
transaction: as a savepoint it would release after that transaction committed — measured, `RELEASE
SAVEPOINT can only be used in transaction blocks`, from a provisioning that published inside
`UserRepository.exclusively`. It is opened on a fork of its own, never through the context's entity
manager: MikroORM's `REQUIRES_NEW` suspends the caller's transaction by clearing it from the caller's
fork until the new one ends, which is right for a caller that awaits it and wrong for an unawaited
publish — measured, the provisioning's next write went out on another connection, outside the
transaction that held the row it referenced (`authors_id_foreign`). A tenant's transaction is opened on
a fresh fork of the tenant's entity manager as well, so no identity map outlives its unit.

**In the tenant the message names.** The relay delivers a streaming group's messages outside any
request, so nothing has opened the tenant a message belongs to. The manager is told the message the
unit handles, and when that message's metadata names a tenant (`x-tenant`) and there is no open
transaction to join, it opens the transaction on that tenant's entity manager
(`TenantEntityManagerService`, `@nestposts/database`, optional) — which is where Axon's multi-tenancy
picks a connection too, before the handler runs. Otherwise it opens it on the entity manager of the
context: the request's, which `TenancyModule` already put in its tenant.

**One connection carries everything a unit writes**, so it answers `requiresSequentialInvocation =
true`, and the unit runs its phase actions one at a time.
