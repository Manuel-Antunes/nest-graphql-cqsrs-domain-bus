# The same system, on Lambda

Eight functions of ours plus the Next server — none of them on a schedule —, one FIFO topic, three
FIFO queues (and their dead-letter queues), one Postgres, one Redis (Valkey, cluster mode off: Better
Auth's sessions and the gateway's cache), one CloudFront router and one SES identity.
The domain, application and presentation code is **unchanged**: what a handler here does is hand AWS's
calling convention to the same container `main.ts` starts.

```
  CloudFront ──────► Gateway   apps/gateway/dist/lambda/http — the supergraph, composed from baked SDL
  /graphql              │ reads the session (Redis, then Postgres); forwards cookie + bearer + x-tenant
       │                ├──────────────► NotificatorApi  apps/notificator/dist/lambda/http
       │                ▼                (the notifications subgraph)
       │            ┌─────────────────────────────────────────────────────┐
  CloudFront ──────►│ PostsApi          apps/posts-api/dist/lambda/http   │
  /api/auth         │ Function URL, InvokeMode: RESPONSE_STREAM           │
                    │ the posts subgraph, Better Auth, the read model     │
       │            └───────────────────────┬─────────────────────────────┘
       │                                    │ posts.PostPreCreated / Updated / Deleted / Restored
       │                                    │ (its outbox, drained before the invocation answers)
       │                                    ▼
       │                      ╔═══════════════════════════════╗
       │                      ║  SNS FIFO   nestposts-events  ║  ← the topic exchange, translated
       │                      ╚═══╤═══════════════════════╤═══╝
       │       filter: namespace=posts│         │qualifiedName=posts.PostCreated
       │              origin≠tagging  │         │origin≠posts-api
       │                              ▼         ▼
       │                   ┌────────────────┐ ┌──────────────────┐
       │                   │ SQS FIFO       │ │ SQS FIFO         │
       │                   │ TaggingPost…   │ │ PostsApiCompleted│
       │                   └───────┬────────┘ └────────┬─────────┘
       │                           ▼                   ▼
       │                        Tagging           PostsApiInbox
       │                  tagging/lambda/sqs   posts-api/lambda/sqs
       │                           │
       │                           └─ posts.PostCreated ─► back to the topic
       │
       │   PostsApi / PostsApiInbox ── notifications.NotificationReceived ─► topic
       │        (whichever saw PostCreated)        qualifiedName filter ─► SQS FIFO NotificatorNotifications
       │                                                                    └► Notificator ─► SES (Email)
       ▼
  /  ────────────► Web   apps/web, OpenNext, in the VPC (it holds its own Better Auth)
                          └─ notifications.NotificationReceived ─► topic   (its own outbox, drained)

  what a drain could not publish stays in that service's outbox, committed, and leaves with the
  next unit of work of the same service that writes to it — nothing runs on a timer
```

## How to read this if you know the RabbitMQ version

It is not a new design. It is `nestposts.events`, piece by piece:

| RabbitMQ | AWS | where |
|---|---|---|
| topic exchange `nestposts.events` | SNS FIFO topic | `messaging/topic.ts` |
| a queue's binding | a subscription's **filter policy** | `messaging/routing.ts` |
| routing key `posts.PostCreated.<id>` | the `routingKey` message attribute, and `pattern` in the body | each publishing app's `OutboxPackets.aws` (`infrastructure/transport/outbox-packets.ts` in posts-api and tagging, `src/nest/outbox-packets.ts` in the web) |
| one queue per consuming service | one SQS FIFO queue per consuming service | `messaging/queues.ts` |
| `@EventPattern(...)` on a controller | **the same `@EventPattern`** | unchanged |
| `outbox.destinations`, keyed by namespace | **the same destinations**, around an `SnsClientProxy` | unchanged |

Switching transports cost **one branch in each application's transport factories** —
`InboundTransport`, and the client its `PostEventsClient` builds, with the packet it is wrapped in
(`OutboxPackets.for(app.transport)`, the application's own, beside the client) — which is what keeping
the destination out of the event and the wire format in one `toPacket` bought: the code says *what*
goes out, the configuration says *where*. The SNS packet lifts into message attributes the routing
facts `routingAttributesOf` names (`@nestposts/transport-eventbus`), the same list the filter policies
below select on, so the two cannot drift apart.

The filter policies are not written here twice, either — `messaging/routing.ts` imports
`SnsFilterPolicy` and `POSTS_NAMESPACE` from the workspace, so a namespace renamed in `@EventType`
takes its subscriptions with it.

## FIFO is not tuning

`apps/tagging` **writes** to the Post's stream: it reads the stream, lets the aggregate decide, and
appends at the next sequence. Two events of one post processed concurrently are two appends racing
for the same position.

The `MessageGroupId` is the aggregate id — and it **already existed**: it is the last segment of the
routing key, which ordered nothing on a plain topic exchange. Here it becomes what makes ordering
exist. Different posts go in parallel; two events of the same post do not. The outbox keeps the same
order on the way to the topic: its `key` is the same aggregate, and one key's messages are published
one at a time, in the order their transactions committed.

The `MessageDeduplicationId` is the envelope's id, the event's own identifier — so a relay that
publishes one message twice (a drain that timed out after SNS took it, a lease that ran out under a
publish) is deduplicated by AWS before the far side's inbox has to. That is why content-based
deduplication stays off.

On a standard topic this saga does not work worse. It breaks, intermittently and in proportion to
load.

## One queue per service, and the measurement that decided it

The obvious shape is a queue per slice of the flow — one for the `PostPreCreated` that starts the
decision, one for the updates that are only replicated — each with its own function, dead-letter
queue and concurrency. It was built that way, deployed to LocalStack and driven with the two events
a post gets in its first second:

```
inbox ← posts.PostUpdated      from 'posts-api'
inbox ← posts.PostPreCreated   from 'posts-api'
ERROR  failed to ingest PostUpdatedEvent; it will be REJECTED
       duplicate key value violates unique constraint "event_log_pkey"
       Key (stream_id, sequence)=(f126e059-…, 0) already exists.
```

**SQS FIFO orders messages within a queue, not between queues.** The split gave away exactly the
guarantee the previous section is about. It converges — the store refuses, SQS redelivers, and the
stream ends up right — but it costs a rejected message, a message group held for a whole visibility
timeout, and a dead-letter queue that fills under load.

So `apps/tagging` gets one queue and the whole namespace, which is what its controller binds anyway.
With that, the same run:

```
 sequence |        message_type
----------+----------------------------
        0 | posts.PostPreCreated#1.0.0
        1 | posts.PostCreated#2.0.0
        2 | posts.PostUpdated#1.0.0
```

zero rejections, every queue and dead-letter queue empty.

`apps/posts-api` keeps a queue of its own: it is a different service with a different inbox, and it
projects onto a row instead of appending to that stream.

## The files

```
sst.config.ts        at the ROOT because that is where the CLI looks — and it holds no
                     infrastructure: app() plus `await import('./infra/aws')` inside run()
infra/scripts/       discover.sh, migrate.sh, e2e.sh, stack-graph.sh, object-exists.mjs,
                     log-group.mjs, notification-delivered.mjs
infra/aws/
  index.ts           the facade: load order and outputs. Creates nothing.
  support/           the DEFINITIONS — classes and types. Nothing here creates a resource on import.
    functions.ts       NodeFunction, QueueWorker, Migrator, StreamingFunction
  network/           the VPC
  data/              the database — one instance, two schemas
  messaging/         topic.ts, queues.ts, routing.ts — the "exchange", translated
  storage/           the bucket posts keep their files in, served by the router under /files
  mail/              the SES identity the notificator sends email as (MAIL_SENDER, from .env)
  compute/           the functions
    platform.ts        where support/ finds the resources: network, links, environment, the build
    build.ts, environment.ts, api.ts, gateway.ts, workers.ts, migrations.ts
  edge/              the CloudFront router: router.ts creates it, routes.ts points it, domain.ts
                     is the stage's own domain when BASE_DOMAIN names one (optional)
  web/               the Next application, on the same origin
  chatwoot/          Chatwoot's two Fargate services, and the router's paths to them
infra/lambda/
  collector.yaml     the collector extension's configuration, travelling beside every bundle
  otel-preload.cjs   the Lambda instrumentation, loaded through NODE_OPTIONS=--require before the handler
```

The arrow always points the same way: **the definer does not know the instantiator**.
`compute/platform.ts` is the only place the two sides meet, and that is why it is a file of its own.

`edge/` is split for the same reason `messaging/` is: the router's URL is part of the API's
environment (`AUTH_URL`, `WEB_URL`, `AUTH_TRUSTED_ORIGINS`), and the router's routes point at the
API's URL. Creating the router first and routing it afterwards is what unties that.

### Components, not loose resources

| component | children |
|---|---|
| `NodeFunction` | the `sst.aws.Function` |
| `QueueWorker` (extends) | \+ the queue subscription, with `partialResponses` |
| `Migrator` (extends) | \+ the `aws.lambda.Invocation` that runs the migration |
| `StreamingFunction` (extends) | \+ the Function URL with `InvokeMode: RESPONSE_STREAM` |

They buy a shared lifecycle, a URN of their own in Pulumi's state, and a deploy tree that describes
the system. But the reason they exist here is narrower: **each one encodes a setting that fails
silently when it is changed**, so that it cannot be forgotten by whoever adds the next function.

### One origin, and why the browser never leaves it

`apps/web` holds its own Better Auth and signs the session cookie; `apps/posts-api` resolves that
same cookie against the same row. On two domains that needs a cookie domain, a SameSite policy and a
CORS list that all agree. Behind one router it needs nothing: `/graphql` goes to the gateway,
`/api/auth` to the API function, everything else to the Next server, and the browser stays where it
logged in.

**Except billing, which goes back to the Next server** — `/api/auth/billing`, `/api/auth/checkout`
and `/api/auth/polar` are routed to its function URL in `web/index.ts` (the router picks the longest
prefix, so they win over `/api/auth`). The billing plugins are contributed only to the web's Better
Auth instance, where the listeners that grant `author` live; the API's instance has none of those
endpoints, and with the one `/api/auth` route the plans page loaded and every call it made answered
`404` — the webhook included. Locally nothing routes: the web serves the whole of `/api/auth` itself,
which is why only a deployed stage could show it. The subgraphs keep their own Function URLs, which the gateway calls — and which anything
that can reach them can call too; the gateway is the place for a policy about who may.

### Chatwoot: the one container, on the same router

`chatwoot/index.ts` is the port of `gmpa-monorepo-migrate`'s `infra/aws/chatwoot.ts`: the Rails
server as a Fargate service behind a load balancer, and Sidekiq as a second service on the **same
image** — read back from the first one's task definition, so a deploy builds Chatwoot once. It is not
a function because nothing in it is built to be one: Puma holds ActionCable's websockets and Sidekiq
polls Redis. It shares the VPC, the Postgres (its tables in the `chatwoot` schema, which the container
prepares on boot with `db:chatwoot_prepare`) and the Valkey, on database `1`; its files go to a bucket
of its own, through Active Storage.

**It is on the router, by path, like everything the browser talks to.** Chatwoot has no sign-in of
its own — it reads the session cookie the web signs — and on the one origin that cookie simply
arrives: `/app`, `/vite`, `/cable`, `/api/v1`, `/api/v2`, `/rails` and the rest of `ROUTED_PATHS` go
to its load balancer, none of them a path the web serves, and the embed at `/atendimento` frames the
same origin. Its GraphQL, which the gateway calls, is `/chatwoot/graphql`, rewritten to `/graphql` —
that path is the gateway's. The load balancer answers plain HTTP (there is no certificate without a
domain); the browser only ever sees CloudFront's HTTPS, and the router hands Rails the viewer's host
as `x-forwarded-host`, which is what its absolute URLs are built from.

What a first deploy of a stage needs, beyond the `.env`: `sst secret set ChatwootSecretKeyBase
$(openssl rand -hex 64)`. The order is the stack's to keep — the `Migrate` invocation waits for
Chatwoot's web service (`Migrator`'s `after`), because `migrate()` ends by mirroring the platform's
users, organizations and teams into Chatwoot, which on a new stage has no tables until that service
has booted once. And the GlitchTip project `nestposts-chatwoot` is created by the owner stage: deploy
that stage first, or every other stage fails to find the key it looks up by name.

What was left behind in gmpa's version: the subdomain (and the domain it needs), the EFS volume (the
files are in S3), the Evolution API service and the Natasha inbox lock (this system has neither), the
agent-bot queue (`APP_QUEUE_URL`), SigNoz (telemetry goes to Better Stack, directly, since a
container has no collector extension beside it), and SMTP: without `SMTP_ADDRESS` Chatwoot sends no
email of its own.

### Files: one bucket, served by the same router

`storage/bucket.ts` is a private bucket (`access: 'cloudfront'`) that the router serves under
`/files`, so a post's file is on the origin the browser is already on. The route **rewrites** the
path: without it CloudFront would ask S3 for the key `files/assets/…`, which does not exist. The
API gets the bucket as a link (the IAM comes with it, and only the two functions of the `posts`
platform have it) and as `DRIVE_BUCKET`, and `DRIVE_CDN_URL` is `<router>/files/`, which is what the
URL of a public attachment is built from.

Uploads do not cross the API. The browser `PUT`s to a URL the API presigned — signed with the
function role's own temporary credentials — which is why the bucket's CORS allows `PUT` from the
router's origin and no other. What is uploaded waits under `tmp/`, which the lifecycle rule empties
after a day, until a post takes it; the API only accepts a key it issued to the same user, because
taking it MOVES the object.

A user's avatar takes the same road: the browser uploads through `generatePresignedUrl` — signed in,
under its own `tmp/<user>/`; signing up, under `tmp/anonymous/` — and hands the upload to Better Auth
as `image`, which `/api/auth` routes to the API, whose Better Auth stores it under `avatars/`. A Google
sign-in's picture is downloaded there too. The web gets `DRIVE_BUCKET` and `DRIVE_CDN_URL` and no
link: it never writes to the bucket here, it only builds the URL of an avatar its own Better Auth
reads.

`e2e.sh` step 9 walks a file through all of it, and asks S3 itself — with `object-exists.mjs`, since
the CDN would keep serving a deleted object from its cache — whether the replaced and the deleted
files are really gone.

### The migrations run on their own

`Migrator` creates the function **and** the `aws.lambda.Invocation` that calls it during
`sst deploy`, with `Date.now()` as the input so it runs every time. The migrations are idempotent, so
repeating costs one query against the history table. The gain is that **a migration that fails
becomes a deploy that fails**, instead of a forgotten function and a `relation "posts"."post" does
not exist` on the first request.

`migrate()` ends by pruning the inbox (`pruneInbox()`, `apps/migrator/README.md`): the
`transport.outbox_inbox` rows processed longer ago than `INBOX_RETENTION_DAYS` are forgotten. That is
the only thing that ever deletes them on AWS — no function here runs on a timer — so the table is
trimmed once per deploy, for every service at once, since it is one table for all of them.

`if (!$dev)` because under `sst dev` there is no published artifact to invoke.
`infra/scripts/migrate.sh` re-runs it by hand.

On the **first** deploy of a stage that race is real and unhandled: the graph orders this after the
RDS Proxy, but `RegisterDBProxyTargets` returns before the target is healthy, and an unready proxy
accepts the connection and closes it — `Error: Connection terminated unexpectedly`, in 141ms, from
code that is correct. Re-run `sst deploy`; every deploy after the first has no race to lose.

### The seeders run when the seeders change

`Seed` is a function and an invocation of its own, and the difference from `Migrate` is the
invocation's **input**. `Migrate` takes `Date.now()`, so it runs every time: migrations are a ledger,
repeating costs one query, and a migration that fails should fail the deploy. Seeding writes rows a
person can edit afterwards, so running it on every deploy is a deploy that quietly undoes their work.
Its input is a **digest of `apps/migrator/src/seeders`**, so Pulumi re-runs it when those sources
change and leaves it alone when they do not.

What it seeds is `DatabaseSeeder` (the default tag, a domain fact) plus `TestUsersSeeder` — the
accounts a deployed stage should have, created **through Better Auth itself**, which is why they come
with a credential account and a password that signs in rather than a row with a hash somebody made
up. `SEED_AUTHOR_EMAIL`, `SEED_AUTHOR_PASSWORD` and their `SEED_READER_` twins change who is created
without touching code. They are ordinary credentials in a deployed database: for anything but a demo
stage, set them.

### The functions, from five builds

| function | handler | what triggers it |
|---|---|---|
| `Gateway` | `apps/gateway/dist/lambda/http.handler` | the Function URL, behind the router at `/graphql` |
| `PostsApi` | `apps/posts-api/dist/lambda/http.handler` | the Function URL: the router at `/api/auth`, and the gateway |
| `NotificatorApi` | `apps/notificator/dist/lambda/http.handler` | the Function URL, called by the gateway |
| `PostsApiInbox` | `apps/posts-api/dist/lambda/sqs.handler` | the `PostsApiCompleted` queue |
| `Tagging` | `apps/tagging/dist/lambda/sqs.handler` | the `TaggingPostEvents` queue |
| `Notificator` | `apps/notificator/dist/lambda/sqs.handler` | the `NotificatorNotifications` queue |
| `Migrate` | `apps/migrator/dist/lambda.handler` | the deploy, and `migrate.sh` |
| `Seed` | `apps/migrator/dist/lambda.seedHandler` | the deploy, when the seeders change |

`PostsApi` and `PostsApiInbox` are the **same bundle**, one webpack build with two handler entries
(`lambda/http`, `lambda/sqs`), sharing one `bootOnce`. Nothing in Node forces the split a Quarkus
classpath would, and one bundle means the projection that runs in the queue function cannot drift from
the read model the API serves.

### Email: an SES identity, linked to the one function that sends

`mail/email.ts` turns `MAIL_SENDER` from the root `.env` into something to link. By default it is an
`sst.aws.Email` — an address, verified by the link SES mails to it on the first deploy, or a domain,
verified by its DNS records. With `MAIL_SENDER_EXISTING=true` the identity is one already verified in
the account and managed elsewhere: the stack does not create it (that fails with
`AlreadyExistsException`) and does not import it (`sst remove` would then delete an identity other
things send through); it links an `sst.Linkable` carrying `ses:SendEmail` and `ses:SendRawEmail` on the
identity's ARN. Only `Notificator` links either, and it sends with `MAIL_TRANSPORT=ses` (nodemailer's
SESv2 transport, configured in `apps/notificator/src/config/mail.config.ts`) and
`MAIL_FROM` derived from the sender.

While the account is in the **SES sandbox**, mail is delivered only to verified addresses. Anything
else fails at SES, the channel throws, the ingestion's transaction rolls back — its inbox row with
it — and SQS redelivers; after five deliveries the message lands in the dead-letter queue. The
`database` channel is still delivered and recorded in the ledger by then, because a delivery commits
in a transaction of its own (`NotificationDeliveryRepository.recordAfter`), not in the ingestion's, so
nothing is stored twice when it is redriven.

Push is not configured here: without `FIREBASE_CREDENTIALS` the `push` channel sends nothing.

## The outbox: every function drains, and nothing runs on a timer

A service does not send an event, it writes it — one outbox row, in the transaction of the command or
the ingested message that raised it — and `@nestjs/outbox`'s relay publishes it afterwards
(`libs/core/transport-eventbus/README.md`). In a container the relay is a loop. A function is frozen
the moment it answers and can hold no loop, so every function that publishes runs with
`POSTS_OUTBOX_RELAY=drain` / `TAGGING_OUTBOX_RELAY=drain` (`compute/environment.ts`), and the web with
`WEB_OUTBOX_RELAY=drain`: after each unit of work that staged messages commits, `EventOutbox.drain()`
calls the relay's `runOnce()` while a round publishes something, ten rounds at most, before the
function answers — the command's own promise covers the publish.

The outbox is still worth its table with no scheduled component behind it, because both ways of
doing without it lose. Publishing inside the transaction — a dual write — puts an event on the wire
for a transaction that may still fail to commit: a phantom `PostPreCreated`, which tagging decides on
and posts-api has no row for. Publishing after the commit without a durable record loses the event
whenever the function is frozen or killed between the two.

**What a drain could not publish stays in the outbox, committed, and the next unit of the same service
that writes to it drains it with its own.** A broker that refused a message had it rescheduled with
the outbox's backoff; a function that died between the commit and the publish left it due. Either way
it is there, and `runOnce()` claims whatever of the service's messages is due, not only what the
committing unit staged — so the next command posts-api runs, or the next message tagging decides on,
publishes what the previous one left behind. Only a unit that wrote to the outbox drains: a query
publishes nothing and so sends nothing on. A round that publishes nothing ends the drain, which is
what keeps a broker that is down from spending every attempt a message has inside one invocation.
**While the service receives nothing that publishes, nothing publishes what it left behind.** That is
the deliberate trade for having no scheduled component: nothing is deployed, invoked or authenticated
on a clock, and the delay is bounded by the service's traffic rather than by one.

**A failure after the commit is never turned into the caller's error** — no 500, no SQS redelivery.
The work happened, and retrying it would redo the work, not publish it: a client sending
`createPost` again would create a second post, and a redelivered message would be dropped by the
inbox, whose row committed with the work. Only a failure up to and including `PREPARE_COMMIT` rolls
the unit back, and that one the edge retries: SQS redelivers the message, the client sends the
request again.

Every row carries its service's `producer`: the `transport` schema is one for every service, and a
drain only ever publishes the rows its own service wrote. The notificator publishes nothing and drains
nothing. The inbox is not the outbox's to prune: the deploy does it, once, for every service (see
**The migrations run on their own**).

A message the relay gives up on — twenty attempts, by default — is a **dead letter**, and is reported
to GlitchTip by `DeadLetterReporting`, from `@nestjs/outbox`'s `nestjs:outbox:dead-lettered`
diagnostics channel, in the trace of the request that raised it. That report is the only signal: there
is no lag warning, and a message waiting for its service's next drain is not an alarm. Requeueing a
dead letter is `@nestjs/outbox`'s `OutboxDeadLetters`, once whatever refused it is fixed; the requeued
message goes out with the service's next drain, like any other that is due.

## Build and deploy

```bash
npx sst deploy --stage dev      # builds the applications, deploys everything, runs the migrations
./infra/scripts/e2e.sh dev      # what the deployed stack answers
pnpm graph:stack dev            # the dependency graph of what is deployed — see below
npx sst remove --stage dev      # tears it down — this stack exists to be torn down
```

One secret, once per stage:

```bash
npx sst secret set AuthSecret "$(openssl rand -base64 32)" --stage dev
```

It is Better Auth's `AUTH_SECRET` in every process that holds an instance — posts-api, the
notificator, the migrator and the web — which is what makes a session one of them signed a session
the others resolve.

Billing is three more, all **optional**, and a stage that sets none of them deploys with billing
off — each is an `sst.Secret` with a placeholder, so a missing one is a value and not a failed deploy:

```bash
npx sst secret set PolarAccessToken <token> --stage dev        # '' by default: billing off
npx sst secret set PolarEnvironment production --stage prod    # 'sandbox' by default
npx sst secret set PolarWebhookSecret whsec_… --stage dev      # '' by default: no webhooks
```

- **The server is Polar's sandbox unless a stage says otherwise.** The root `.env` holds a
  PRODUCTION token, and a stage that inherited it would sell for real from a throwaway deploy — so
  the token is a secret per stage and never read from the `.env`, and `production` has to be set by
  hand where it is meant.
- **The webhook secret belongs to an endpoint registered in Polar at
  `<router>/api/auth/polar/webhooks`** — Polar generates it when the endpoint is created. Without it
  checkout and the portal still work and nothing reacts to a subscription: no `author` role, no email.
- They reach `apps/web` only: it is the one process holding the billing plugins.

Sign in with Google is two more, optional the same way — both empty, the provider is absent and no
button is offered. The OAuth client's authorized redirect URI is `<router>/api/auth/callback/google`,
and both the API (which `/api/auth` routes to) and the web (which draws the button) get them:

```bash
npx sst secret set AuthGoogleId <client id> --stage dev
npx sst secret set AuthGoogleSecret <client secret> --stage dev
```

And the telemetry destination, which is **not** a secret but the `.env` at the root — `sst deploy`
loads it by itself, and `.env.example` is the template:

```bash
BETTER_STACK_URL=https://sNNNNNNN.us-west-2a.betterstackdata.com
BETTER_STACK_API_KEY=<the source token>
```

Both are **required**: a missing value stops the deploy (`requiredEnv`, in `compute/environment.ts`)
rather than publishing a stack that costs the same, looks healthy and answers nothing when somebody
asks what happened. They are the **collector's** configuration and not the application's — every
function exports to the extension on `localhost:4318`, and the extension is what talks to Better
Stack.

#### The exporter's name travels with the layer version

The exporter's type in `infra/lambda/collector.yaml` is `otlp_http`, which is what the pinned layer's
collector (**v0.157.0**) calls it; `otlphttp` still works there but logs `"otlphttp" alias is
deprecated; use "otlp_http" instead` on every cold start. On older collectors it is the other way
round — v0.109.0 knows only `otlphttp` and refuses the file with `unknown type: "otlp_http"`.

It earns a heading because of how it fails. An extension that cannot load its configuration does not
fail the function, so the wrong name is a stack that deploys, serves traffic and reports nothing,
forever. **Whoever bumps `COLLECTOR_LAYER` checks this line**, and the check is the function's own
log group: the collector prints `Everything is ready. Begin running and processing data.` when it
came up.

### Why an extension and not a flush

A Lambda is frozen the moment its handler returns, so an in-process batch processor loses whatever it
is holding. Flushing by hand at the end of every invocation fixes that and costs a round trip per
request, with a telemetry concern sitting in application code. `infra/lambda/collector.yaml` moves
the batching out: the SDK exports each span to `localhost` as it ends, and the collector's
**`decouple`** processor lets the invocation finish while the export carries on across the next one.

Logs go the same way — `loggingModule()` makes them pino records, `PinoInstrumentation` puts
`trace_id` on each, and the collector's `logs` pipeline sends them where the traces went.

### The installed half is pinned, and the reason is an outage

`nodejs.install` accepts a list of names or a map of name to version. The list form is what the
documentation shows and it is a trap: SST expands it to `{ name: "*" }` and installs inside the
artifact, so the **lockfile plays no part** and every version is resolved at deploy time. `*` also
never picks a prerelease.

That cost a working authentication stack. `better-auth-mikro-orm@1.0.0-next.2` — the version this
repository installs, tests and runs locally — was deployed as **0.5.0**, whose adapter asks MikroORM
for `metadata.has(name)` where 7 wants `getByClassName(name)`. Every function booted, every
anonymous query answered, and the first request to `/api/auth/*` returned
`Cannot find metadata for "AuthUser" entity`. No suite could have caught it: they all run the
version in `node_modules`.

`InstalledPackages.pinnedTo` reads each version off the installed tree — from the repository root or
from whichever workspace package declares it, because `better-auth` belongs to `libs/auth` — so what
is deployed is what was tested. It throws rather than guessing when a listed package is not
installed.

### The tenant migrations travel beside the bundle

A tenant's schema is migrated by the first function that serves it (see the root `CLAUDE.md`), from
`join(__dirname, 'migrations', 'tenant')`. Every function of posts-api, tagging and the notificator
therefore has `copyFiles: tenantMigrationsOf('<app>')` — `apps/<app>/dist/migrations` to
`migrations`, beside the bundle — and each of those files `require`s `@mikro-orm/migrations`, which
is why that package is on `INSTALLED_PACKAGES`: the bundle's `Migrator` and the migration files must
be one copy. The migrator's own function bundles its migrations as a list and needs no files. There is
no schema variable any more: every function connects to `public`, and the migrator runs the system
migrations, then every tenant's.

### Three things the bundling must not do

All three are silent when they are wrong:

1. **`minify: false`, `keepNames: true`.** Nest's DI and AutoMapper read the `design:type` metadata
   `tsc` emitted and look classes up by **name**. Minifying renames them, the metadata then describes
   types nothing resolves, and the build still succeeds — the failure is a provider that is
   `undefined` at runtime. It is the same reason each application's webpack build compiles with
   `tsc` and `optimization: false`.
2. **The handlers point at `dist/`**, already compiled with decorators — each Lambda handler is an
   entry of its application's webpack build, the workspace libraries compiled in. esbuild only
   bundles here; it never transpiles a decorator, which it cannot do.
3. **`nodejs.install` keeps MikroORM and the OpenTelemetry packages out of the bundle.** MikroORM is
   ESM-only and resolves parts of itself at require time; an instrumentation works by patching a
   module **as it is required**, which is precisely what bundling removes. A bundled `pg` is a `pg`
   nothing can instrument, and the traces come out missing the database with nothing to say they are.

## Subscriptions, both halves

They work here, and it took fixing two independent things.

**The transport.** `onPostCreated` and `onPostUpdated` travel over **GraphQL-over-SSE** — the Yoga
driver serves them on the same `/graphql` endpoint, to a request that asks for `text/event-stream`.
That is exactly what a Function URL with `InvokeMode: RESPONSE_STREAM` carries:

```
$ curl -N -X POST $API/graphql -H 'accept: text/event-stream' \
       -d '{"query":"subscription { onPostCreated { id title } }"}'
HTTP/1.1 200 OK
content-type: text/event-stream
cache-control: no-cache
Transfer-Encoding: chunked
:
```

The keep-alive arrives immediately. That is the half `graphql-ws` could never have had: a WebSocket
upgrade dies at the load balancer, before the function.

**The source.** A `SubscriptionBus` stream is fed by the `EventBus`, which reaches subscribers of the
container it runs in and nobody else — and here the container that closes the saga is the **queue**
function while the one holding the stream open is the HTTP one. A subscriber on the plain bus would
see what its own container published and never the `PostCreated` coming back from `apps/tagging`.

So the bus itself is event sourced. `POSTS_SUBSCRIPTION_SOURCE=feed` — set on the API functions by
`compute/environment.ts` — turns on `subscriptions: true` in posts-api's `TransportEventBusModule`,
which binds the `EventBus` token to `EventSourcedEventBus`: its observable side is the one
`transport.event_log` every container appends to, in the same transaction as the work that raised
each event. A subscription reads that log forward from **the head at the moment it opened**. The
cursor is in memory and dies with the process, which is what a subscription means: a subscriber is not
owed what happened before it arrived.

What the log deliberately does **not** feed is the handlers and the sagas. If it did, every
`@EventsHandler` and every saga in every container would fire again for one event — a projection
written as many times as there are containers. They read the process's own `subject$`, bound before
the bus is repointed at the log; only what pipes the bus later — a `@SubscriptionHandler` — reads the
log.

`libs/core/transport-eventbus/src/subscriptions/event-sourced-event-bus.spec.ts` asserts all three
readers, so a Nest upgrade that moves a saga's subscription out of registration fails a test rather
than duplicating commands here.

## The stack graph

`pnpm graph` draws the project graph, which is the layer graph. This is the other one: what is
actually **deployed**, as Pulumi holds it.

```bash
pnpm graph:stack dev                      # .sst/graph/dev.dot, and .svg if graphviz is installed
pnpm graph:stack dev --short-node-name    # names instead of whole URNs — usually what you want to look at
pnpm graph:stack dev --ignore-parent-edges
```

SST has no `stack graph` of its own, and `pulumi stack graph` reads the graph out of the most recent
deployment **of a stack in a backend** — the one thing an SST app does not have, because the state
lives in SST's own bootstrap bucket and `pulumi` is never pointed at it. So
`infra/scripts/stack-graph.sh` builds the missing half: `sst state export` prints that deployment, a
file backend in a temp directory is created to import it into, and then the real `pulumi stack graph`
runs against it. Everything after the stage is passed to that command as it is, so its
[flags](https://www.pulumi.com/docs/iac/cli/commands/pulumi_stack_graph/) all work.

What `sst state export` prints is `{ stack, latest }`: `latest` is the deployment Pulumi keeps, and
`stack` is `<org>/<app>/<stage>`. The throwaway takes its project and stack names from there rather
than out of the config, because they have to match what the resources carry — an import into a stack
the URNs (`urn:pulumi:<stage>::<app>::<type>::<name>`) do not name is refused.

**Only the structure is imported** — the URN, the parent, the dependencies — and never `inputs`,
`outputs` or the secrets provider. That is not tidiness. A real state carries **encrypted values**,
and `pulumi stack import` re-encrypts them as it writes the snapshot, with the passphrase that state
was sealed with; SST keeps that passphrase in SSM rather than in the state, so an import of the whole
thing stops at `failed to encrypt: incorrect passphrase`. Importing no secret is what makes the
passphrase irrelevant — and it is why nothing secret of yours is ever written to the temp directory.
The graph is made of what is left.

A stage that was never deployed, and one that `sst remove` emptied, both still **have** a state: a
manifest, a secrets provider and no resources at all. The script says which it is rather than drawing
an empty graph.

Nothing writes to the state SST keeps. The copy goes with the temp directory, and that is what makes
`--force` and `--disable-integrity-checking` safe to pass: they are there so that a state somebody
has edited by hand (`sst state edit`) still draws instead of erroring.

Two colours, both Pulumi's own. **`#AA6639`** is a parent edge, which is the component tree of
`support/functions.ts` — `PostsApi` over its `aws:lambda/function:Function`, its role and its log
group. **`#246C60`** is a dependency, and that is the one worth reading: it is the order the engine
computed, and the edge carries the property that created it (`secretId`, `secretString`). `Build` is
the node to look for, because **every** function built from the applications hangs off it —
`Gateway`, `Migrate`, `PostsApi`, `PostsApiInbox`, `Seed`, `Tagging` and the notificator's two —
which is `dependsOn: [build]` in `compute/platform.ts` and the whole reason that resource exists.

The SVG is rendered `rankdir=LR`: top to bottom, a stack this size comes out a strip twenty times
wider than it is tall. The DOT is left exactly as Pulumi wrote it, to be re-rendered however you
like.

## Cost, and the two lines that are it

**Two** NAT gateways — SST puts one per availability zone — a `t4g.micro` Postgres and a `t4g.micro`
Valkey (about US$ 9 a month of it), on the order of **US$ 0.12/hour**, running whether anything is
invoked or not. Chatwoot adds a load balancer and two Fargate tasks of 0.5 vCPU / 1 GB each (Spot
outside production), roughly another **US$ 0.05/hour**. The functions themselves are billed per invocation and round to nothing at this
scale. `sst remove` is not optional.

The NAT is there because the functions sit in the VPC to reach the database and still have to reach
SNS and SQS. VPC endpoints for those two services would replace it, and are the first thing to change
if this stack ever stays up.

## Locally, the same topology

`docker compose up -d localstack` creates the same topic, the same two queues, the same filter
policies and the same FIFO settings — `docker/localstack/init/10-messaging.sh`, which is meant to be
read beside `messaging/`. Then:

```bash
export AWS_ENDPOINT_URL=http://localhost:4566 AWS_REGION=us-east-1
POSTS_TRANSPORT=aws TAGGING_TRANSPORT=aws pnpm dev
```

The difference is only who drives the consumer: a Lambda invocation there, `SqsStrategy`'s polling
loop here. Same strategy class, same `processRecord`, same controllers.
