# web-e2e

The whole system, through a browser: **Playwright**, a real RabbitMQ, a real Postgres, and the two
backend services running as the **images they are packaged as**.

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
through the management API, or the Inngest dev server's `/v1/events` — and `src/support/messages.ts`
is the one place that knows which. A test that could only be written against one of them would be a
test of the transport rather than of the system.

`E2E_KEEP_STACK=1` leaves everything running after the report, which is the only way to ask a broker,
a dev server or a database what it thinks about a failure; with `TESTCONTAINERS_RYUK_DISABLED=true`
beside it, the reaper leaves it alone too. Both are for a person at a keyboard: the stack they leave
behind holds ports the next run needs, so clean up before running again.

It replaced `posts-api-e2e`, and the reason is the frontend: the saga was already proven across two
processes, but nothing proved that a person could sign in, be refused, write a post and watch another
service complete it. Now the same run does both — and it keeps every assertion the old suite had,
because a Playwright test is Node and can read a schema and a queue as easily as a page.

## The four levels, and where this one sits

This is the outermost. `apps/posts-api`'s own suite fakes the second service on purpose
(`TaggingStandIn`), and `transport-loop.spec.ts` fakes the transport. Here nothing is faked:
`posts-api`, `tagging` and `web` are three `node`/`next` processes, the broker routes between them,
each service keeps its own schema, and the client is Chromium.

## What the stack does

`src/support/stack.ts`, once, in Playwright's `globalSetup`:

1. **A network, and everything but the web on it.** `src/support/containers.ts` starts Postgres and
   RabbitMQ, runs `nestposts/migrator:dev` as a **one-shot** — waited on until it exits 0, so nothing
   comes up against a schema that does not exist — and then `nestposts/tagging:dev` and
   `nestposts/posts-api:dev`. Those are the images `apps/<app>/Dockerfile` build and
   `docker compose --profile apps` runs, so this suite drives what that profile serves.

   **Inside the network nothing has to learn a port**: the services address `postgres:5432` and
   `rabbitmq:5672` by alias. Only what the host has to reach is published, wherever Docker likes, and
   the suite reads the mapping back. The one exception is the API, bound to a host port picked up
   front by `FreePort` — it signs cookies against its own origin, so it has to know it before it
   boots, which is one round earlier than a mapped port exists.

   **`apps/web` stays a process**, started by `next start` the way `nx` serves it everywhere else. It
   is the thing under the browser: keeping it out of an image keeps a failure one `tail` away.
2. **The queues are deleted, not purged.** Purging takes the messages and leaves the BINDINGS, which
   are durable and survive a redesign of the topology: a `posts.*` from an earlier version stays
   hanging and makes the topology lie about the current design.
3. **Both schemas are dropped and rebuilt** by `apps/migrator`, which is the same path production
   takes. They are the ordinary `posts` and `tagging` and not throwaway names, because a migration's
   SQL is qualified with the schema it was generated in.
4. **The three applications start as processes**, logs captured to `target/logs`, and the suite waits
   for each to answer.
5. **Two accounts are registered** through `apps/web`'s own sign-up endpoint, and one is promoted to
   `author`.

**`AUTH_SECRET` is one value for all three, and that is the point rather than a convenience.**
`apps/web` holds its own Better Auth and signs the session cookie itself; `apps/posts-api` resolves
that same cookie against the same row. A different secret per process and the browser would log in
and be refused one hop later — which is exactly what `o cookie que o web escreveu é aceito pela
posts-api` exists to catch.

The applications are not compose services on purpose: this repository builds them with `tsc` and
`next build`, and putting an image between the test and the code would prove nothing more. What it
costs is a `dependsOn` on their `build` targets, which is in `package.json`.

`globalSetup` and `globalTeardown` share the stack through a module-level holder
(`src/support/running-stack.ts`), because Playwright runs both in the **main** process — a second
`Stack` would have no child handles and would leave three servers running. The accounts cannot travel
that way, since specs run in worker processes, so they go through a file.

## What the specs read

| spec | what it proves |
|---|---|
| `authentication` | the cookie is written by this application's own Better Auth, is `httpOnly`, survives a reload, is refused for a wrong password, is cleared by signing out — **and is accepted by the posts-api**, which is the whole point of the web holding its own |
| `authorization` | the three states of `/posts/new` (anonymous, authenticated without the role, author); that the refusal is the server's and not the screen's; that reading is anonymous on purpose; and that `me` is polymorphic — `User` for the reader, `Author` for the author |
| `federation` | the subgraph called the way a router calls it: `_entities(representations:)` resolving a `Post`, its `Author` and its `Tag` by key alone, anonymously — and answering `null`, in its own position, both for a key that resolves to nothing and for an author asked for as a `User` |
| `reading` | a post written by an author reaches someone who never signed in, with `author` and `tags` resolved — the two `@ResolveField`s, seen on the page |
| `saga` | the post is written in the FORM, the mutation answers version 1, and version 2 arrives after the other process decides the tag. Then what the browser cannot see: both services' durable state, both inboxes, a redelivery held by the inbox and the aggregate, the replica channel, one correlation id across two processes, and the `x-tenant` of the **browser** on the headers of both events |

Everything goes through the browser and `/api/graphql` — the proxy the page itself uses, which puts
the request's cookie and its `x-tenant` on the way out. Two exceptions, both deliberate:

- **`Registrar` promotes to `author` straight on the credential**, because granting a role is not an
  operation of this system (the identity port does it, in code) and opening an endpoint for it would
  be production surface existing because of a test. The domain profile is promoted by the application
  itself on the next request, which is the part worth exercising.
- **one assertion talks to the posts-api directly**, to show that the cookie the web wrote is accepted
  there. That is the claim, so bypassing the web is the test.

The redelivery case builds the envelope **by hand** and publishes it through the management API, which
makes it a test of the wire format as well: the event as the application wrote it in the body, and
everything said about it in the AMQP headers. The `x-tenant` case sets the header on the **browser
context**, so it crosses Chromium → the Next proxy → the mutation → the broker → the other process,
and comes back on that process's own decision.

## `executeGraphql` takes a document, not a string

The GraphQL a spec writes is **generated against the SDL**, the same way `apps/web`'s is: `codegen.ts`
reads `apps/posts-api/src/graphql/**/*.graphql` and the client preset writes `src/gql/` — which is
generated, git-ignored, and produced by the `codegen` target that both `e2e` and `typecheck` depend
on. An operation is declared with `graphql()` and executed with the `executeGraphql` fixture:

```ts
const FeedTotalCount = graphql(`
  query FeedTotalCount {
    posts(first: 1) {
      totalCount
    }
  }
`);

test('o feed responde sem sessão', async ({ executeGraphql }) => {
  const posts = await executeGraphql(FeedTotalCount);
  expect(typeof posts.data!.posts.totalCount).toBe('number');
});
```

What that buys is that **a query the API cannot answer stops being a failing test and becomes a
failing build**. `graphql()` returns a `TypedDocumentNode`, so:

- a field that is not on the type is rejected by codegen (`Cannot query field … on type "Post"`), and
  never reaches the browser;
- the answer is typed from the selection — `posts.data!.posts.totalCount` is `number | null`, with no
  type argument written by hand and no `any` to hide a rename;
- the variables are the operation's — an operation that declares none refuses a second argument, and
  one that declares `$id: ID!` refuses to be called without it.

The one thing a spec here cannot ask for is `_entities`: it is in no `.graphql` on disk —
`buildSubgraphSchema` adds it at runtime — so codegen would reject the document. The `federation`
spec therefore drives the **screen** that asks, which is the level this suite works at anyway; what
the subgraph answers field by field is asserted in `apps/posts-api`'s own e2e.

`executeGraphql` still goes through the browser's `/api/graphql`, exactly as the old `graphql` helper
did: the transport is the same, only the argument changed. The two places that cannot use the fixture
— the assertion that talks to the posts-api directly, and the `x-tenant` one that needs its own
browser context — use the same documents through `print()`, so there is no untyped query in the suite.

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

`workers: 1` and `fullyParallel: false` are not caution: the stack is one Postgres, one broker and one
set of three processes, and the saga's assertions read durable state a second worker would be writing
at the same time. This suite trades parallelism for being able to claim what it claims.
