# @nestposts/outbox-mikro-orm

[`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox) on MikroORM and PostgreSQL: the store the
package leaves to the application, the tables it keeps, the transaction a unit of work writes through,
and the housekeeping the package does not do.

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
    OutboxHousekeepingModule.forRootAsync({             // pruning, health, the scheduled sweep
      inject: [outboxConfig.KEY],
      useFactory: ({ relay, inboxRetention }: OutboxConfig) => ({
        interval: relay === 'poll' ? '1h' : false,
        inboxRetention,
      }),
    }),
    TransportEventBusModule.forRootAsync({
      /* identity, … */
      transaction: MikroOrmUnitOfWorkTransaction,        // what every unit of work runs in
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

## `MikroOrmUnitOfWorkTransaction`

The transaction a unit of work runs in, on MikroORM: `inRequestContext` around `em.transactional`, whose
fork every injected entity manager resolves to while the unit runs, and which it hands the unit as the
transaction's handle — the `Tx` the outbox and the inbox write through. `detached()` is the same with
`REQUIRES_NEW`, for a publish that nobody awaits inside the caller's transaction.

It is `transport-eventbus`'s `UnitOfWorkTransaction` by its shape, without importing it, and it is the
application that hands it to the bus: `transaction: MikroOrmUnitOfWorkTransaction`.

## `OutboxHousekeepingModule`

What `@nestjs/outbox` leaves to the application, in `OutboxHousekeeping`:

- the inbox is **pruned** of what every consumer processed longer ago than `inboxRetention` (`30d`);
- the outbox's **health** is read and reported when a due message has waited longer than `lagWarning`
  (`1m`) or there are dead letters;
- a message given up on is an **error** in the log, not a warning among the retries.

A long-lived process does the first two on a timer (`interval`, `1h`, unreferenced). A function has no
timer that survives it (`interval: false`), so a schedule calls `sweep()`, which also publishes what is
due, a batch at a time (`batchSize`, `100` — the relay's, when it is not the default). It speaks only
`@nestjs/outbox`, so it holds for whichever store is registered.
