# `apps/gateway`

The one GraphQL endpoint a client talks to. It federates two subgraphs:

| subgraph | served by | what it owns |
|---|---|---|
| `posts` | `apps/posts-api` | posts, tags, users and their subscriptions (`onPostCreated`, `onPostUpdated`, …) |
| `notifications` | `apps/notificator` | notifications and devices, and `IUser.notifications` / `IUser.unreadNotificationCount` through `@interfaceObject` |

Everything here is composition — which subgraphs, where they are, how a bearer is verified. The
machinery is `@nestposts/federation-gateway` (`libs/core/federation-gateway`), whose README is the
guide.

## The supergraph is composed from the subgraphs' own SDL

Both subgraphs are schema-first, so their `src/graphql/*.graphql` files ARE their SDL. The webpack
build (`webpack.config.js`, the shared `tools/webpack/nest-application.js`) copies them into
`dist/subgraphs/<name>` as assets — `scripts/subgraph-sources.mjs` is the one list of where each comes
from — so `nx serve` picks up a subgraph's SDL change like any other. The gateway composes them at
boot; the image and the Lambda bundle carry the same directory. The gateway holds no database, so it
is the one application whose bundle carries no tenant migrations. Composition happens without any
subgraph being up — a cold subgraph slows only the operations that reach it.

`nx run @nestposts/gateway:supergraph` writes `dist/supergraph/supergraph.graphql` and
`dist/supergraph/api.graphql`. The second is the schema `apps/web` and `apps/web-e2e` generate their
types from — their `codegen` targets depend on it — and `test/supergraph.spec.ts` fails the build when
the two subgraphs stop composing.

## Environment

| variable | default | |
|---|---|---|
| `GATEWAY_PORT` / `PORT` | `4000` | |
| `GATEWAY_URL` | `http://localhost:<port>/graphql` | this gateway as a resource — the audience of the OAuth tokens it accepts |
| `POSTS_SUBGRAPH_URL` | `http://localhost:3000/graphql` | |
| `NOTIFICATIONS_SUBGRAPH_URL` | `http://localhost:3002/graphql` | |
| `GATEWAY_SUBGRAPHS_DIR` | `dist/subgraphs` beside `main.js` | where the baked SDL is read from |
| `GATEWAY_CORS_ORIGINS` | `WEB_URL`, then `http://localhost:4200` | the browser calls the gateway cross-origin for SSE |
| `AUTH_JWKS_URL` | `${AUTH_URL}/api/auth/jwks` | the identity provider's keys |
| `AUTH_ISSUER` | `WEB_URL` | the `iss` an access token must carry |

## Credentials

The browser's session cookie and a client's `Authorization` header are forwarded to every subgraph
an operation reaches, with `x-tenant`. Each subgraph authenticates the caller itself, through the same
Better Auth instance it always had: a cookie as a session, and — through the `oauth-bearer-session`
plugin in `libs/auth` — an OAuth access token issued for this gateway as a session too. The gateway
verifies a bearer only to know who it is for (and which organization, when the token says), never to
decide on a subgraph's behalf.
