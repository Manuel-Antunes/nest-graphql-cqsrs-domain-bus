# retry-policy

An opt-in retry and give-up policy for `@EventPattern` handlers, over whichever transport the
application listens on. A handler declares how many times it may fail; the transport's own retry
mechanism does the retrying; the policy decides, on every failure, whether to ask for another
delivery or to let the message go.

```ts
@EventPattern(EventAddress.everyEventOf(POSTS_NAMESPACE))
@RetryPolicy({ maxRetries: 3, skipHandlerToken: ParkedPostAlert })
posts(@TransportEvent() event: DomainEvent): Promise<void> {
  return this.ingestion.ingest(event);
}
```

`@RetryPolicy` applies `MaxRetriesInterceptor` (which reads the policy) and `MaxRetriesFilter`
(which acts on it). `maxRetries` counts **retries**, from zero: `3` is up to four deliveries.

## Wiring

Once, at the composition root, with the producer of the transport the application receives on:

```ts
RetryPolicyModule.forRootAsync({
  useFactory: () => ({
    exceptionProducer: exceptionProducer(),
    defaultMaxRetries: 3,
  }),
})
```

The module is global, because Nest instantiates a method-scoped interceptor or filter in the module
that **declares the controller**, and a feature module should not have to import the policy to use it.

| transport | producer | reads the retry count from | retry | give up |
|---|---|---|---|---|
| SQS | `SqsExceptionProducer` | `SqsContext.getRetryCount()` (`ApproximateReceiveCount - 1`) | throw: SQS redelivers after the visibility timeout | return: the record is deleted |
| Inngest | `InngestExceptionProducer({ retryDelayMs })` | `InngestContext.getAttempt()` | throw, as a `RetryAfterError` when `retryDelayMs` is set | return: the run completes |
| RabbitMQ | `RmqExceptionProducer(topology)` | the `x-death` rejections of its own queue | `nack` without requeue: the queue dead-letters it into the delay | park in `<queue>.dead`, then `ack` |

The contexts come from `@nestposts/microservices-aws` and `@nestposts/microservices-inngest`, and
`RmqContext` from `@nestjs/microservices`.

On Inngest the function has a retry ceiling of its own, and it wins if it is lower:
`InngestStrategy({ retries })` should be at least `maxRetries`.

## RabbitMQ: the delay is a queue

```
                 nack(requeue=false)
  <queue>  ───────────────────────────▶  <queue>.retry      x-message-ttl: retryDelayMs
     ▲        x-dead-letter-exchange ''
     │        x-dead-letter-routing-key <queue>.retry
     │                                          │ expires
     └──────────────────────────────────────────┘
          x-dead-letter-exchange '', x-dead-letter-routing-key <queue>

  RetryAfterException  ─▶  <queue>.delayed   per-message expiration, then back to <queue>
  exhausted / non-retriable  ─▶  <queue>.dead   with x-retry-attempt, x-retry-failure, x-original-routing-key
```

Everything goes through the **default exchange**, addressed by queue name, so a message coming back
from the delay reaches this service's queue and nobody else's — dead-lettering into the topic
exchange would deliver it again to every service bound to it. It works because Nest's `ServerRMQ`
reads the pattern from the message body, not from the routing key.

```ts
const topology = new RmqRetryTopology({ queue: INBOUND_QUEUE, retryDelayMs: 5_000 });

{
  transport: Transport.RMQ,
  options: { queue: INBOUND_QUEUE, queueOptions: topology.queueOptions(), noAck: false, ... },
}

new RmqExceptionProducer(topology);
```

- `queueOptions()` adds the dead-letter arguments to the main queue. RabbitMQ refuses to redeclare
  a queue with different arguments (`PRECONDITION_FAILED`), so a queue that already exists without
  them has to be deleted once.
- The retry, delayed and dead queues are declared by the producer on the first failure, before the
  first `nack` — a message dead-lettered to a queue that does not exist is dropped.
- With `noAck: false`, Nest's `ServerRMQ` never acknowledges an event on its own. The interceptor
  does, through `ExceptionProducer.acknowledge`, once the handler succeeds: a handler without
  `@RetryPolicy` on an `RmqExceptionProducer` application is never acknowledged.
- `RetryAfterException` republishes to `<queue>.delayed` with a per-message `expiration` and acks the
  original. RabbitMQ only expires the message at the head of a queue, so a long delay holds back a
  shorter one queued behind it.

## `RetryAfterException`

`retryAfter` is **seconds** when it is a number or a numeric string, or a `Date`. Each producer turns
it into what its transport speaks: a visibility timeout on SQS, a `RetryAfterError` on Inngest (which
rounds up to the second), an `expiration` in milliseconds on RabbitMQ.

## A failure has to reach the handler to be retried

The policy sees what the handler's promise rejects with. In this repository a controller calls
`EventIngestion.ingest`, and the work an event sets off — a saga dispatching a command — runs after
that call's transaction. `EventIngestion` opens its unit of work with `failOnTrackedFailure`, so a
command a saga dispatched that throws rejects the ingestion, and it forgets the inbox row it wrote,
so the redelivery is acted on instead of dropped as a duplicate.
