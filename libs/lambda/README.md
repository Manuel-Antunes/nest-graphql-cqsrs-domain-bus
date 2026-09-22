# @nestposts/lambda

**How AWS enters a Nest application.** Three functions, no framework: the applications are unchanged,
and what a handler here does is hand AWS's calling convention to the same container `main.ts` starts.

| | |
|---|---|
| `bootOnce(bootstrap)` | one boot per container, during the **init phase** |
| `streamingHandler(booted)` | HTTP, answered as a stream through a Function URL |
| `queueHandler(booted)` | SQS, one result per record |

```ts
// apps/tagging/src/lambda/server.ts
export const booted = bootOnce(async () => {
  const app = await NestFactory.createMicroservice(AppModule, lambdaTransport());
  await app.listen();
  return app;
});

// apps/tagging/src/lambda/sqs.ts
export const handler = queueHandler(booted);
```

## Why the boot is at module scope

Module scope runs during the Lambda **init phase**, which happens before the first invocation is
handed over; a boot started inside the handler happens on the invocation's own clock. For a Nest
application — an ORM connecting, a GraphQL schema being built, a container being wired — that is the
whole cold-start strategy.

It is a `ReplaySubject` and not a cached promise because there are **three** outcomes and a promise
expresses two: the booted application replayed to every later invocation, a boot **failure**
propagated to all of them, and an invocation that **gives up** without cancelling the boot.

That third one is the point. An HTTP invocation that waits for the function's own timeout bills the
whole timeout — often a hundred times the wait — and reports as a Lambda `Status: timeout`, which no
alarm on 5xx and no caller can see as anything but silence. So `streamingHandler` answers **503 with
a `retry-after`** instead. `queueHandler` does the opposite and lets the boot timeout throw, because
a queue message has somewhere to go back to and an HTTP request does not.

A boot that **fails** exits the process: the container is poisoned, every invocation routed to it
would fail identically forever, and exiting makes the runtime discard the sandbox so a transient
failure costs one cold start.

## The one line that is not obvious

```ts
context.callbackWaitsForEmptyEventLoop = false;
```

Without it Lambda waits for the event loop to drain before finishing the invocation — and these
applications hold a MikroORM pool, a transport client and OpenTelemetry's batch timers, so the loop
**never** drains. Every invocation then runs to the full timeout: the container stays busy, no warm
instance is ever reused, and every request pays a cold start while being billed for the timeout.

Both handlers set it, and both `await flushTelemetry()` before returning — a Lambda has no shutdown,
so whatever the span processor is holding when the container freezes is sent whenever, or never.

## Response streaming needs three things

1. a **Function URL** with `InvokeMode: RESPONSE_STREAM` — API Gateway does not stream, in any mode
   (`infra/aws/support/functions.ts`);
2. the handler wrapped in `awslambda.streamifyResponse`;
3. a proxy that returns a `Readable` — `@fastify/aws-lambda`'s `payloadAsStream`, which is why
   `apps/posts-api` runs on Fastify.

`awslambda` is a global the Node runtime injects, not a package. `@types/aws-lambda` declares it, so
the **type** is available in every file while the **value** exists in one place; `lambdaRuntime()` is
what turns calling it outside Lambda into a sentence instead of `awslambda is not defined`.
