# web-e2e

The whole system, through a browser: **Playwright**, a real Postgres, a real broker or the Inngest
dev server, and every backend service running as the **image it is packaged as**.

```bash
pnpm test:web          # this suite alone
pnpm test:e2e          # every `test-e2e` in the workspace, this one included
```

**It configures nothing and asks for nothing.** Every piece of infrastructure is a Testcontainers
container on a network of its own, published on ports Docker picks — so another project holding 5432
or 5672 is not this suite's problem, and there is no schema to drop or queue to delete before a run,
because there is nothing there to begin with.

**It runs twice, over both transports**, and nothing is skipped in either: `E2E_TRANSPORT=inngest`
(the default) and `E2E_TRANSPORT=rabbitmq`. Where a claim is checked differs — a spy queue drained
through the management API, or the Inngest dev server's `/v1/events` — and
`src/infrastructure/messaging/wire.ts` is the one place that knows which. A test that could only be
written against one of them would be a test of the transport rather than of the system.

**The Inngest run is the serverless shape, too.** Inngest is what a serverless deployment uses — a
function the dev server invokes, on Vercel as on Lambda — so in that run posts-api reads its
subscriptions from the event store (`POSTS_SUBSCRIPTION_SOURCE=feed`, `RunEnvironment.postsSubscriptionSource`), as it does on
AWS, where it runs as many containers as it has concurrent requests; the RabbitMQ run keeps a
long-lived process's `local`. That is not taste: in `feed` every publish writes, an unawaited one
included, and a failure only that mode has — provisioning a profile on the first request in a new
tenant, whose detached transaction suspended the provisioning's own — reached AWS because no suite
here ever ran posts-api in `feed`. The one claim it changes is what the event store holds of a post
tagging gave up on: in `feed` posts-api stored the post's birth itself, so `saga-retry.spec` expects
`[PostPreCreated]` there and nothing in the other run.

`E2E_KEEP_STACK=1` leaves everything running after the report, which is the only way to ask a broker,
a dev server or a database what it thinks about a failure; with `TESTCONTAINERS_RYUK_DISABLED=true`
beside it, the reaper leaves it alone too. Both are for a person at a keyboard: the stack they leave
behind holds ports the next run needs, so clean up before running again.

## How the suite is built

A spec says **what** is claimed. Everything it needs to say it — driving a screen, reading an inbox,
querying a schema, bringing the stack up — lives in a layer of its own, and each layer only knows the
ones below it:

```
src/
  specs/            the claims. They call objects; no locator, no SQL, no fetch
  fixtures/         the composition root: environment → infrastructure → screens and workflows
  workflows/        a person's goal across screens and inboxes: sign in, reset a password,
                    publish a post, invite a member, subscribe to a plan
  pages/            one page object per screen (and Polar's hosted pages), plus WebApp, which holds
                    all of them for one browser page
  components/       what several screens share: the header, the notification bell, billing cards
  infrastructure/   the system from outside the browser: the database (one *Records class per
                    concern), Mailpit, the wire, S3, Polar, Better Auth's HTTP API, GraphQL
  environment/      what the global setup hands the workers: RunEnvironment, the seeded accounts
  stack/            provisioning, for the global setup only: containers, the web process, billing
  model/, support/  values every layer speaks (Account, PostDraft, EmailSubject…) and small tools
                    (Poll, Totp, Unique)
```

**The dependency rule is checked, not only written down.** `apps/web-e2e/biome.json` — this
project's own configuration, extending the root's — carries one `noRestrictedImports` override per
layer, so a page object that imports a workflow, a mailbox or the
stack — or a spec that imports `@playwright/test`, `pg` or `stack/` — fails `pnpm lint`:

| layer | may import | may not import |
|---|---|---|
| `model/`, `support/` | nothing in the suite | every other layer |
| `environment/` | `model/`, `support/` | clients, screens, workflows, the stack |
| `infrastructure/` | `environment/`, `model/`, `support/` | screens, workflows, fixtures, the stack |
| `pages/`, `components/` | `model/`, `support/`, each other | the environment, infrastructure, workflows, the stack |
| `workflows/` | pages, components, infrastructure, environment | fixtures, the stack |
| `stack/` | environment, infrastructure, workflows | screens, fixtures |
| `specs/` | fixtures, infrastructure, model, support, workflows | the stack, the environment, pages, and any driver (`@playwright/test`, `pg`, `testcontainers`, the AWS and Polar SDKs, `graphql`) |

The objects, and what each one is for:

- **A page object is a screen and nothing else.** It opens its path, exposes what a spec asserts on as
  `Locator`s (`app.newPost.notAnAuthor`) and performs what a person does there
  (`app.newPost.publish(draft)`). When an action takes the browser somewhere, the page waits for it
  to arrive — `ForgotPasswordPage.requestReset` ends on `/auth/reset-link-sent` — so a spec never
  races a navigation. better-auth-ui's views extend `AuthView`, which opens a view only once it can be
  typed into.
- **`WebPage.reopenUntil(assertion)` is the one way to wait for the system through a screen.** A page
  is rendered per request and subscribes to nothing, so an assertion on the DOM waits for a render
  that already happened; reloading until the assertion holds waits for the other service. The
  assertion stays in the spec.
- **A workflow is a goal, with whatever it takes.** `PasswordRecovery.resetPassword` opens the form,
  waits for the email, follows its link and chooses the new password. A workflow is bound to one
  browser page; a story with two people in it — an admin and the user they ban, an owner and the
  invitee — is told in the spec, with a second **visitor**.
- **A visitor is a person at a browser page**: `Visitor` holds that page's `WebApp`, its GraphQL client
  (through the web's `/api/graphql`, with that page's cookie and `x-tenant`) and every workflow bound
  to it. The test's own page is the `visitor` fixture, and `app`, `graphql`, `authentication`,
  `publishing` and the rest are its members, exposed as fixtures so a spec asks only for what it uses.
  `visitors.arrive(options)` opens another browser context — anonymous, or with
  `extraHTTPHeaders` — and closes it when the test ends.
- **Infrastructure reads what the browser cannot see.** `postRecords`, `eventLog`, `inbox`,
  `credentialRecords`, `organizationRecords` and `notificationRecords` share one `Database` over the
  root tenant's `search_path`; `mailbox` is Mailpit; `wire(queue)` is this run's transport;
  `appendFaults` breaks the event log and clears itself after the test; `endpoints` reaches the
  posts-api and the gateway past the web, on purpose.
- **Fixtures are the only place anything is constructed.** A spec receives objects; it does not
  `new` a client or read `process.env` — the run's settings are the `environment` fixture.

### Writing a spec

1. Say the claim in the test's name, and ask the fixtures for what the claim needs.
2. If the screen has no page object, add one under `pages/` and register it in `WebApp`. Locators are
   accessible names — `getByRole`, `getByLabel`, `getByText` — as a person reads the screen.
3. If the goal crosses screens or waits for an email, it is a workflow: add it under `workflows/`,
   build it in `Visitor`, and expose it as a fixture in `fixtures/test.ts`.
4. If the claim is about durable state, add a query to the `*Records` class that owns the table — or
   a new one, with its fixture in `fixtures/infrastructure.fixtures.ts`. SQL lives there, never in a
   spec.
5. A GraphQL operation goes in `infrastructure/graphql/operations/`, next to the others of its domain.
   An email's subject goes in `model/email.ts`, where the workflows that wait for it read it too.

```ts
test('an owner invites by email, and the invitee joins through the link', async ({
  mailbox,
  registration,
  authentication,
  organizations,
  organizationRecords,
  visitors,
}) => {
  const owner = await registration.freshAccount('Owner');
  const invitee = await registration.freshAccount('Invitee');
  const name = `Acme ${Date.now()}`;

  await authentication.signIn(owner);
  await organizations.create(name);
  await organizations.invite(invitee.email);

  const invitation = await mailbox.waitFor(
    invitee.email,
    EmailSubject.invitation(owner.name, name),
  );
  const invited = await visitors.arrive();
  const acceptance = await invited.organizations.followInvitation(invitation, invitee);
  await expect(acceptance.invitationTo(name)).toBeVisible();
  await acceptance.accept();

  await expect
    .poll(() => organizationRecords.rolesOf(name, invitee.credentialId))
    .toEqual(['member']);
});
```

## The four levels, and where this one sits

This is the outermost. `apps/posts-api`'s own suite fakes the second service on purpose
(`TaggingStandIn`), and `transport-loop.spec.ts` fakes the transport. Here nothing is faked:
`posts-api`, `tagging`, `notificator` and the `gateway` are the packaged images, the broker or the dev
server routes between them, and the client is Chromium on `apps/web`.

## What the stack does

`src/stack/stack.ts`, once, in Playwright's `globalSetup`:

1. **A network, and everything but the web on it.** `src/stack/container-stack.ts` starts Postgres,
   Redis, MinIO, Mailpit and — on that run — RabbitMQ, runs `nestposts/migrator:dev` as a **one-shot**,
   waited on until it exits 0 so nothing comes up against a schema that does not exist, and then
   `tagging`, `notificator`, `posts-api` and the `gateway`. Those are the images
   `apps/<app>/Dockerfile` build and `docker compose --profile apps` runs, so this suite drives what
   that profile serves. On the Inngest run the dev server starts last, and each service registers its
   functions with a `PUT`.

   **Inside the network nothing has to learn a port**: the services address `postgres:5432` and
   `rabbitmq:5672` by alias. Only what the host has to reach is published, wherever Docker likes, and
   the suite reads the mapping back. The exceptions are the API and the gateway, bound to host ports
   picked up front by `FreePort` — the API signs cookies against its own origin, and the gateway's URL
   is the audience every OAuth token is issued for, so both have to be known before they boot.

   **MinIO is the other one, for the same reason.** The services reach it as `minio:9000`, but the
   browser uploads to it and loads a post's file from it, and a signed URL is bound to the host it
   was signed for. So its host port is picked up front too, and handed to `posts-api` as
   `DRIVE_S3_PUBLIC_ENDPOINT`: operations go to the alias, URLs go to the host. The bucket is created
   by the suite (`src/infrastructure/storage/storage.ts`) and answers anonymous reads under `assets/`
   only, where a post keeps its file — what a bucket behind a CDN amounts to.
2. **Where it all ended up is published as environment** (`RunEnvironment.publish`), because a
   Playwright worker is a process forked after the setup, and what it inherits is exactly that.
3. **Chatwoot starts as processes on the host** (`src/stack/chatwoot-stack.ts`): `rails
   db:chatwoot_prepare` as a one-shot, which loads its `chatwoot` schema into the suite's Postgres
   beside the platform's tables and the triggers the migrator made to mirror users, organizations and
   teams into it; then Vite and the Rails server, on a port picked up front. The gateway, in its
   container, reaches that port as `host.testcontainers.internal` (`TestContainers.exposeHostPorts`)
   to compose the `chatwoot` subgraph, and the web frames it on `/atendimento`. It needs the Ruby of
   `apps/chatwoot/.ruby-version` with its gems installed — the `test-e2e` action sets both up — and
   Postgres is `pgvector/pgvector`, because Chatwoot's schema enables `vector`.
4. **Theo is a script on a port of its own** (`src/infrastructure/agents/theo-stand-in.ts`), started
   before the web, which is pointed at it (`THEO_AGENT_URL`, `THEO_AGENT_AUDIENCES`). The suite runs no
   model and no AgentCore: what `theo.spec` proves is the web's half — the chat drawn from AG-UI
   events, the CopilotKit runtime behind `/api/copilotkit`, and the token the web hands the agent,
   which the stand-in verifies against the web's own JWKS and keeps, with what it was asked, at
   `GET /received` (`TheoRecords`). Each run answers the way Theo does when it hands a question to the
   posts agent: a `send_message_to_a2a_agent` call, the posts agent as an AG-UI subagent of it, its
   result and Theo's answer. The chain behind the real one is `apps/theo-agent`'s spec.

   A question a spec scripts first (`theoScript.opensThePostsApp(question, { tool, input })`,
   `POST /openings`) is answered the way the posts agent answers when its model opens the **posts MCP
   App**: the stand-in calls that tool on the real MCP server, with the person's token, in app mode
   (`PostsMcpApp`), and the delegation's result is `{ a2ui_operations, answer }` — an A2UI surface on
   the catalog the web declared in the run's context, whose root `McpApp` names the server, the
   `ui://` resource, the tool, its input and its result. Only the model's choice is scripted; it keeps
   the catalogs the web declared beside each invocation.
5. **`apps/web` starts as a process**, by `next start` the way `nx` serves it everywhere else, with
   its log in `target/logs`. It is the thing under the browser: keeping it out of an image keeps a
   failure one `tail` away. It publishes on the run's transport too — the emails its Better Auth asks
   for are notifications. It is told where the posts MCP server will be (`POSTS_MCP_URL`, a port
   picked up front, and `POSTS_MCP_RESOURCE`), which its `/api/copilotkit` proxies the app's reads and
   buttons to, as the person.
6. **The posts MCP server starts once the web answers**, from `apps/mcp`'s image (`nestposts/mcp:dev`:
   Apollo MCP Server and the posts MCP App behind Caddy), calling the gateway's container. The web is
   its authorization server — it validates every token against the web's discovery document and keys,
   and checks that the document's issuer is the URL it asked, `localhost` on the web's port — so its
   Caddy is given one site more than the image's: that port, forwarded to the host
   (`host.testcontainers.internal`). Everything else in its Caddyfile, the rewrite of AgentCore's header
   into `?app=` included, is `apps/mcp/config/Caddyfile` as it is. Every service that reads a bearer
   accepts the MCP server's audience (`AUTH_OAUTH_RESOURCES`), because the server passes the person's
   token to the gateway as it is.
7. **Three accounts are registered** through the web's own sign-up endpoint and verified by the link
   in their email (`Registration.seed`): an author, a reader and an admin. They reach the workers
   through `target/accounts.json`.

**`AUTH_SECRET` is one value for every process, and that is the point rather than a convenience.**
`apps/web` holds its own Better Auth and signs the session cookie itself; `apps/posts-api` resolves
that same cookie against the same row. A different secret per process and the browser would log in
and be refused one hop later — which is exactly what `o cookie que o web escreveu é aceito pela
posts-api` exists to catch.

`globalSetup` and `globalTeardown` share the stack through a module-level holder
(`src/stack/running-stack.ts`), because Playwright runs both in the **main** process — a second
`Stack` would have no handles and would leave everything running.

## Billing, against Polar's sandbox

`billing.spec` needs somewhere Polar can deliver webhooks to, so when the suite has a token the stack
grows a half of its own (`src/stack/billing-stack.ts`), up **before** the web because the web is
started with the webhook's secret:

1. **The products are found or created in the sandbox** — `nestposts e2e Free` and
   `nestposts e2e Pro`, recognized by a `nestposts_e2e` metadata key, priced in the organization's
   default currency.
2. **A tunnel is opened to the web's port** (`src/stack/tunnel.ts`), as a container: **ngrok** when
   `NGROK_AUTH_TOKEN` is set — the account's own domain, which resolves at once — and a **Cloudflare
   quick tunnel** otherwise, or when ngrok refuses to start (a free account allows one agent session
   anywhere). A quick tunnel's name reaches public DNS some tens of seconds after it is printed, and
   asking early caches an NXDOMAIN, so it waits before the first question and asks public resolvers.
3. **A webhook endpoint is registered at the tunnel**, and Polar generates its secret — the web gets
   `POLAR_ACCESS_TOKEN`, `POLAR_ENVIRONMENT=sandbox` and that `POLAR_WEBHOOK_SECRET`. Endpoints a
   previous run left behind — same URL, or older than two hours — are deleted first.
4. **Once the web answers, an unsigned POST through the tunnel must come back `400`** — the web
   refusing a signature, which proves the tunnel, the route and the secret together, at setup.

The teardown deletes the endpoint and closes the tunnel. Workers learn the endpoint and the products
from `E2E_POLAR_*` variables, through the `billing` fixture (`BillingRun`), which is `null` — and the
spec skipped — when the run has no billing.

**The token is read from `.env.test` (or `E2E_POLAR_ACCESS_TOKEN`), never from `POLAR_ACCESS_TOKEN`**:
`nx` loads the root `.env` into every target, and that one holds a deploy's values
(`src/environment/test-environment.ts`). The client is pinned to the sandbox API and a
`POLAR_ENVIRONMENT` other than `sandbox` is refused. `E2E_BILLING=off` runs the suite without billing
while a token is present.

Polar's pages are driven the way a buyer drives them (`src/pages/polar/`), and the checkout has two
traps. **Each field is saved as it is left** — a `PATCH` to `/v1/checkouts/client/…` — and submitting
reads what was saved, so a field typed and submitted without leaving it first turns the click into a
save; every field is left and its save awaited. **The email must be deliverable**: Polar refuses
`example.com`, so the buyers are `registration.freshAccount(name, { domain: 'mailinator.com' })`,
whose mail lands in Mailpit like every other. The paid plan is the Stripe test card
`4242 4242 4242 4242`, billed to Germany, which asks for no tax id.

## What the specs read

| spec | what it proves |
|---|---|
| `account-emails` | every email authentication sends arrives and finishes its flow in the browser: sign-up verification, a fresh link for an unverified address, a password reset, a magic link, an emailed code (for an existing account and for an address nobody registered), two factor by email, an email change confirmed at both addresses, and an account deletion confirmed before anything is removed |
| `administration` | an admin bans a user on `/admin/users` and the ban holds at sign-in; anybody else is refused |
| `attachments` | a post's file goes from the browser to the bucket under `assets/`, is served from there, is replaced and deleted with the post, and nothing stays in staging |
| `authentication` | the cookie is written by this application's own Better Auth, is `httpOnly`, survives a reload, is refused for a wrong password, is cleared by signing out — **and is accepted by the posts-api**, which is the whole point of the web holding its own |
| `authorization` | the three states of `/posts/new` (anonymous, authenticated without the role, author); that the refusal is the server's and not the screen's; that reading is anonymous on purpose; and that `me` is polymorphic — `User` for the reader, `Author` for the author |
| `avatars` | a user's avatar is an attachment: signing up by email with one stores it under `avatars/` before the address is even verified, and the header shows it once signed in; the account settings upload one, replace it (the old file deleted) and delete it (no avatar, no file) — nothing staying in staging, on either transport |
| `billing` | only with a Polar sandbox token: the plans are the products Polar sells; a free plan checked out in Polar comes back as the subscription; its activation webhook makes the subscriber an **author** and emails them; an unsigned webhook is refused with `400`; cancelling in the portal shows "Ends on", emails, and keeps the role; revoking (the end of the period) takes the role away and emails; that activation **redelivered** grants nothing and emails nobody; a paid plan bought with a test card makes its buyer an author; the portal links back; and Polar's own delivery log shows every event accepted |
| `federation` | the subgraph called the way a router calls it: `_entities(representations:)` resolving a `Post`, its `Author` and its `Tag` by key alone, anonymously — and answering `null`, in its own position, both for a key that resolves to nothing and for an author asked for as a `User` |
| `gateway` | one operation reads from both subgraphs, and a subscription runs through the gateway over SSE |
| `notification-bell` | the bell's dot, opening it marks everything read, and deleting a notification removes the row while the delivery ledger keeps its entries |
| `notifications` | publishing a post notifies its author by email (rendered from its React template) and in the database, each channel once, and the author reads and marks it through the API |
| `oauth` | an admin registers a native client, a user authorizes it on the consent screen, and the code exchanged with PKCE is a token that answers at `userinfo` and is a session past the gateway |
| `organizations` | an owner invites by email, and the invitee signs in through the link and joins as a member |
| `reading` | a post written by an author reaches someone who never signed in, with `author` and `tags` resolved — the two `@ResolveField`s, seen on the page |
| `saga-retry` | a failure deciding the tag is retried by the transport: failing twice and then holding closes the saga with one decision and one inbox row; failing every time stops at `@RetryPolicy`'s ceiling — four deliveries, the post left at version 1, nothing remembered as done — and on RabbitMQ the message is parked in `nestposts.tagging.post-events.dead` with why |
| `saga` | the post is written in the FORM, the mutation answers version 1, and version 2 arrives after the other process decides the tag. Then what the browser cannot see: both services' durable state, the inbox, a redelivery held by the inbox and the aggregate, the replica channel, one correlation id across two processes, and the `x-tenant` of the **browser** on the headers of both events |
| `settings` | a session with no user agent is listed as an unknown browser instead of breaking the page |
| `tenancy` | an organization is a tenant: switching organizations switches the feed, a post is not found from another tenant, and a tenant nobody belongs to is refused |
| `theo` | a signed-in person asks Theo in `/theo` and sees the posts agent's answer inside the delegation that asked for it, and Theo's own answer; the agent was called with a token of theirs — signed by the web, their user as `sub`, addressed to Theo, the posts agent and the MCP server, with the posts scopes — and the thread as AgentCore's session; a visitor is asked to sign in, and the runtime refuses them `401` |
| `theo-posts-app` | the posts MCP App inside the conversation with Theo, everything but the model real: asked to edit a post, the app opens on the author's own posts (read through the MCP server, the gateway and the posts API with the person's token), the post picked is retitled and saved from the app's own button — version 3 in the database — and the conversation hears it; Theo was asked once, so the app's reads and its save never reached the agent, and the web had declared its A2UI catalog with `McpApp`. Asked for a preview, the draft is shown as the blog will show it and nothing exists until the author publishes it there; then the post is theirs, the saga tags it, and the app opens it on the blog in a new tab. Discarding publishes nothing and is heard; and a reader's publish is refused by the posts API, because the app acts as the person |

Everything goes through the browser and `/api/graphql` — the proxy the page itself uses, which puts
the request's cookie and its `x-tenant` on the way out. The exceptions are deliberate:

- **`Registration` promotes to `author` and `admin` straight on the credential**, because granting a
  role is not an operation of this system (the identity port does it, in code) and opening an
  endpoint for it would be production surface existing because of a test. The domain profile is
  promoted by the application itself on the next request, which is the part worth exercising.
  Because it goes around Better Auth, it also rewrites the copy of the user every live session keeps
  in Redis (`SessionCache`) — Better Auth reads a session from there first, and would otherwise go on
  answering the old role. `forgetUserAgentsOf` does the same for the session it blanks: Better Auth
  lists a user's sessions from Redis only.
- **`theoRecords`** reads what the scripted Theo was asked and with which token
  (`GET /received` on `TheoStandIn`): the token is what the browser never sees, so it is checked where it
  arrives.
- **`endpoints.postsApi(...)`** talks to the posts-api directly, to show that the cookie the web wrote
  is accepted there — that is the claim, so bypassing the web is the test — and
  **`endpoints.gateway(...)`** carries an OAuth bearer, which a browser never holds.

The retry cases break the service without touching it: a Postgres trigger on the transport's
`event_log` refuses the append of `posts.PostCreated` a given number of times — which is
`CompletePostWithDefaultTag` failing at `save()` — and counts every attempt in a sequence, which a
rollback does not undo (`AppendFaults`). The service carries no fault switch for them; `tagging` runs
with `TAGGING_RETRY_DELAY_MS=1000` so a retry takes a second instead of five.

The redelivery case builds the envelope **by hand** and publishes it again, which makes it a test of
the wire format as well: on RabbitMQ the event as the application wrote it in the body and everything
said about it in the AMQP headers, on Inngest the same map in the event's `user`. The `x-tenant` case
sets the header on the **browser context**, so it crosses Chromium → the Next proxy → the mutation →
the transport → the other process, and comes back on that process's own decision.

## GraphQL is a typed document, not a string

The GraphQL a spec sends is **generated against the composed API schema**: `codegen.ts` reads
`apps/gateway/dist/supergraph/api.graphql` and the client preset writes `src/gql/` — generated,
git-ignored, and produced by the `codegen` target that both `test-e2e` and `typecheck` depend on. The
operations are declared with `graphql()` in `src/infrastructure/graphql/operations/`, one file per
domain, and executed with the `graphql` fixture — the test page's client, through the web's proxy:

```ts
test('e a leitura é anônima de propósito: o feed responde sem sessão', async ({ graphql }) => {
  const posts = await graphql.execute(FeedTotalCount);
  expect(typeof posts.data?.posts.totalCount).toBe('number');
});
```

What that buys is that **a query the API cannot answer stops being a failing test and becomes a
failing build**. `graphql()` returns a `TypedDocumentNode`, so:

- a field that is not on the type is rejected by codegen (`Cannot query field … on type "Post"`), and
  never reaches the browser;
- the answer is typed from the selection, with no type argument written by hand and no `any` to hide
  a rename;
- the variables are the operation's — an operation that declares none refuses a second argument, and
  one that declares `$id: ID!` refuses to be called without it.

`graphql.data(document, variables)` is the same call for a step that is not the claim: it answers the
data, or throws with the errors. The one thing a spec here cannot ask for is `_entities`: it is in no
`.graphql` on disk — `buildSubgraphSchema` adds it at runtime — so codegen would reject the document.
The `federation` spec therefore drives the **screen** that asks, which is the level this suite works
at anyway.

Codegen runs by itself before `pnpm test:web` and before `typecheck`. To regenerate it alone, or to
keep it running while writing a spec:

```bash
npx nx run @nestposts/web-e2e:codegen
cd apps/web-e2e && npx graphql-codegen --config codegen.ts --watch
```

## Running one thing

```bash
cd apps/web-e2e
npx playwright test src/specs/authorization.spec.ts
npx playwright test -g "o x-tenant do navegador"
npx playwright test --ui                      # the trace viewer, against the same stack
npx playwright show-trace target/playwright/<test>/trace.zip
```

`workers: 1` and `fullyParallel: false` are not caution: the stack is one Postgres, one transport and
one set of services, and the saga's assertions read durable state a second worker would be writing
at the same time. This suite trades parallelism for being able to claim what it claims.
