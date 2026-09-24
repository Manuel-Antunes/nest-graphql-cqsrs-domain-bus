# @nestposts/observability

**The one door to the OpenTelemetry SDK**, as `@nestposts/database` is the one door to MikroORM.

What lives here is the **bootstrap**: the SDK, the OTLP exporter, the list of instrumentations, and
the flush a Lambda needs before it is frozen. What does **not** live here is propagation — carrying a
trace across the wire belongs to `@nestposts/transport-eventbus`, which does it through
`@opentelemetry/api` alone.

That split is the whole design:

| | depends on | why |
|---|---|---|
| a library (`transport-eventbus`) | `@opentelemetry/api` | a no-op until something registers an SDK, so it costs a function call and changes no behaviour |
| an application (`posts-api`, `tagging`, the Lambda) | this package | the SDK is a process-wide decision, and a process has exactly one |

What this package provides is therefore three things: `startTelemetry` (the SDK), `loggingModule`
(the logger), because on their own each is half of what an operator needs, and `useGraphQLTracing`
(`@nestposts/observability/graphql-tracing`), because a GraphQL server's spans come from the server
and not from a patched module.

## Using it

```ts
// apps/tagging/src/telemetry.ts
import { startTelemetry } from '@nestposts/observability';

startTelemetry({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'tagging' });
```

```ts
// apps/tagging/src/main.ts
import './telemetry';   // FIRST, and the reason is below

import { NestFactory } from '@nestjs/core';
```

**It has to be the first import**, and that is not a style preference: an instrumentation works by
patching the module it instruments **as it is required**, so a `pg` or an `http` that was already
loaded is a module nothing is watching. Nothing fails — the traces are simply missing the spans that
matter, which is the kind of thing nobody notices. A side-effect import is the conventional shape
for exactly this reason (it is what `apps/web` does through Next's `instrumentation.ts` hook), and
the import sorter leaves side-effect imports where they are.

## It is off unless something is listening

Started with no collector configured, the OTLP exporter posts to `http://localhost:4318` and logs a
connection failure every few seconds — in every local run and in every test, forever. So the SDK
starts when an endpoint says where to send spans, and otherwise does not:

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm dev
```

`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` does the same; `OTEL_SDK_DISABLED=true` keeps it off; and
`startTelemetry({ enabled: true })` overrides the rule for a deployment that wants the OTLP default.
Everything else — headers, protocol, sampling, the resource — is read from the standard `OTEL_*`
variables by the SDK itself, so pointing this at SigNoz, Jaeger, Tempo or a collector is
configuration and not code.

## Logs and traces are one story

`loggingModule()` replaces Nest's logger with **pino**, and `PinoInstrumentation` puts the current
`trace_id` and `span_id` on every record. Measured, in plain Node:

```
inside a span        trace_id=0214d90aee813b7822f9239c39fdd7eb span_id=d7bcc18c50dfc5f3
outside any span     trace_id=-                                span_id=-
```

So a log line and the span it happened inside stop being two things to correlate by timestamp: open
the trace of a slow `createPost` and the lines that service wrote while handling it are already
there, on the span where they happened. It is also why there is no correlation id of our own on a log
record — `trace_id` already is one, and it is the same value three services away.

**There is no spec for this, deliberately.** The instrumentation works by patching `pino` as it is
**required**, and Vitest loads modules through a runner of its own, so the patch never applies and a
test would fail for a reason that has nothing to do with the code. What is above was produced by
running it outside Vitest, which is the only place it can be true or false.

Pretty output when stdout is a terminal, raw JSON otherwise — `pnpm dev` is read by a person and
CloudWatch is read by a collector.

## What it instruments

Written out rather than taken from `@opentelemetry/auto-instrumentations-node` — which would bring
about forty packages to patch a handful, and a Lambda pays for what it bundles:

`http` (health checks excluded, or a poll a second buries everything), `nestjs-core`, `pg`,
`amqplib`, `aws-sdk` and `pino`. `aws-sdk` is what turns an SNS publish and an SQS receive into spans
of their own; the link between them and the far side's work is the `traceparent` the transport writes
onto the envelope.

**In a Lambda, `http` is not on this list**: `infra/lambda/otel-preload.cjs` registers it, before
the runtime loads anything. The preload's Lambda instrumentation installs the `require` hook every
instrumentation shares, the hook caches each module it sees, and `https` is required before
`startTelemetry` runs — registered here, `HttpInstrumentation` finds it cached and unpatched, and
the gateway's calls to its subgraphs leave with no `traceparent`.

`instrumentations` replaces the list entirely, for a process that instruments less.

## GraphQL: a Yoga plugin, not an instrumentation

```ts
GraphQLModule.forRoot<YogaFederationDriverConfig>({
  // …
  plugins: [useGraphQLTracing({ originOf: EventTrace.of })],
});
```

`@opentelemetry/instrumentation-graphql` is not used, because it cannot see Yoga execute: it patches
`graphql-js`'s `execute`, and Yoga executes with `@graphql-tools/executor` — what it produced was a
parse and a validate per operation and a root span for every schema parsed at boot. Where `graphql`
is bundled, on Lambda, it produced nothing. `useGraphQLTracing` is called by the server itself:

```
mutation CreatePost                 graphql.operation.type/name, graphql.document (literals as *)
├── graphql.parse
├── graphql.validate
└── graphql.execute
    └── Mutation.createPost         what the resolver did — pg, SNS, an HTTP call — is inside it
        └── Post.tags               nested by response path
```

- Every phase runs **inside** its span, so what an instrumentation opens underneath is its child.
- A resolver gets a span only if the schema declares one: the default resolver's fields never do.
  `resolvers: false` turns them off, for a gateway, whose every stitched field has a proxying one.
- A result with errors marks the operation span `ERROR`, with an `exception` event per error carrying
  its `extensions.code` and path.
- **A subscription event is delivered in the trace that produced it.** The subscription's own span
  ends when the stream is set up. Each event gets `subscription OnPostCreated event` (a consumer
  span), a child of `originOf(payload)` and linked to the subscription, and its result carries that
  span's `traceparent` in `extensions` — which is what a gateway in front continues. posts-api's
  `originOf` is `EventTrace.of` (`@nestposts/transport-eventbus`); the gateway's is
  `subgraphEventOrigin` (`@nestposts/federation-gateway`).

It does not use `isObjectType`, or any other `instanceof` of `graphql`'s: under Vitest a Nest
application's schema is built by the CommonJS `graphql` and this module loads the ESM one.

## In a Lambda, the collector does the batching

A Lambda has no shutdown: the runtime freezes the container the moment the handler returns, so
anything an in-process batch processor is still holding is sent whenever — or never, if that
container is reaped. The obvious fix is to flush at the end of every invocation, and it is the wrong
one: it costs a round trip per request and puts a telemetry concern in the middle of application
code.

So the batching moves out of the process. `infra/lambda/collector.yaml` runs the **OpenTelemetry
collector as a Lambda extension**, and two things follow:

- the SDK exports **each span as it ends**, to `localhost` — cheap, because it never leaves the
  sandbox, and nothing is ever held in process. `startTelemetry` picks that automatically when
  `AWS_LAMBDA_FUNCTION_NAME` is set, and batches everywhere else;
- the collector's **`decouple` processor** lets the invocation finish while the export carries on
  across the next one. Without it the function waits for the network before it can answer.

`flushTelemetry()` is still exported, for the other shape — a container stopping, a suite tearing
down — but no handler calls it per invocation any more.

**Do not let a bundler take the instrumentations.** They patch modules as they are required, which is
what bundling removes; `infra/aws/support/functions.ts` lists them under `nodejs.install` so they
stay real files in `node_modules`.
