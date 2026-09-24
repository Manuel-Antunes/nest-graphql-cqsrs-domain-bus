# microservices-inngest

Inngest as a Nest microservice transport. A broker delivers and Inngest **invokes**: the client
proxy sends an event, and the strategy turns every `@EventPattern` into an Inngest function served
over the host application's Fastify adapter. It knows nothing about CQRS, envelopes or `@EventType`.

| | |
|---|---|
| `InngestClientProxy` | sends an event; `InngestRecordBuilder` adds `user` entries, sessions, an idempotency key, a timestamp |
| `InngestStrategy` | receives: one function per pattern, mounted at `/api/inngest` |
| `InngestContext` | `@Ctx()`: the event, the step tools, the run id, the attempt (from zero) |
| `inngestApp(id)` | the client both halves share |
| `literalTriggers`, `claimTriggers` | how a pattern becomes the event names a function is triggered by |

```ts
app.connectMicroservice(
  {
    strategy: new InngestStrategy({
      inngest: inngestApp('billing'),
      httpAdapter: app.getHttpAdapter(),
      retries: 5,
    }),
  },
  { inheritAppConfig: true },
);
```

**Inngest has no wildcards**, so a pattern is resolved into names when the functions are created.
`literalTriggers`, the default, handles a literal name and one whose last segment is `*`; a namespace
(`billing.#`) needs a resolver that knows the names — `@nestposts/transport-eventbus` passes
`inngestTriggers`, which reads the `@EventType` registry. A function takes at most ten triggers, and
the strategy refuses to start rather than serve a function that is never triggered.

**One event is one run.** A queue receives one copy of a message however many of its bindings match;
Inngest runs every function whose triggers include the name. So each name is claimed by the most
specific pattern that asked for it — a literal one, then the one standing for fewer names — and a
broader pattern bound beside it does not see it.

**The retrying is Inngest's.** A run that throws is retried up to `retries` times, a
`NonRetriableError` stops it, and a `RetryAfterError` sets the delay. `@nestposts/retry-policy`'s
`InngestExceptionProducer` speaks exactly that.
