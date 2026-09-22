# web-e2e

The whole system, through a browser: **Playwright**, three real processes, a real RabbitMQ and a real
Postgres.

```bash
pnpm test:web
```

It replaced `posts-api-e2e`, and the reason is the frontend: the saga was already proven across two
processes, but nothing proved that a person could sign in, be refused, write a post and watch another
service complete it. Now the same run does both — and it keeps every assertion the old suite had,
because a Playwright test is Node and can read a schema and a queue as easily as a page.

## The four levels, and where this one sits

This is the outermost. `apps/posts-api`'s own suite fakes the second service on purpose
(`InProcessTagAssignment`), and `transport-loop.spec.ts` fakes the transport. Here nothing is faked:
`posts-api`, `tagging` and `web` are three `node`/`next` processes, the broker routes between them,
each service keeps its own schema, and the client is Chromium.

## What the stack does

`src/support/stack.ts`, once, in Playwright's `globalSetup`:

1. **Infrastructure, reused when it is already up.** `docker compose up -d --wait` for whatever is
   missing — so a broker or a database somebody else is holding is used as it is, and the suite runs
   against a remote one with no Docker at all.
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
