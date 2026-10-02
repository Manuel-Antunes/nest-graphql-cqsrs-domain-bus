# @nestposts/mcp

The blog's posts as **MCP tools**: [Apollo MCP Server](https://www.apollographql.com/docs/apollo-mcp-server/)
over the gateway's composed API schema, one tool per operation in `operations/`. It is configured,
not written: `config/mcp.yaml` is the whole server.

| tool | operation | scope |
|---|---|---|
| `ListPosts` | `posts(first, after)` with authors and tags | `read:posts` |
| `GetPost` | `post(id)` in full | `read:posts` |
| `WhoAmI` | `me`, and an author's latest posts | — |
| `CreatePost` | `createPost` | `write:posts` |
| `UpdatePost` | `updatePost` | `write:posts` |
| `DeletePost` | `deletePost` | `write:posts` |

It also serves an **MCP App**, `posts` — `apps/posts-app`, built into `apps/` (see below) — whose
tools are `ChoosePostToEdit`, `EditPost`, `PreviewPost`, `SavePost` and `PublishPost`.

- **The tool descriptions are in the config** (`overrides.descriptions`), not in `#` comments above
  each operation: an SDL comment is a comment, and this repository writes none.
- **`mutation_mode: explicit`**: the six operations and the app's tools are the surface; the
  `execute` tool is on, because the app's Apollo Client runs its queries through it, and under this
  mode it refuses a mutation — what it runs, it runs as the caller. Its hint says it is the app's, and
  the posts agent leaves it out of what it offers its model.
- **It authenticates every request** (`transport.auth`): a signed JWT from the platform's issuer —
  whose discovery document the gateway serves at the issuer's root, and whose `issuer` must equal
  `servers` exactly — addressed to this server (`POSTS_MCP_RESOURCE`), carrying `read:posts` or
  `write:posts`; each tool also requires its own scope. The **validated token is passed through** to
  the gateway, which is why every Better Auth process accepts this server's audience.
- **Stateless streamable HTTP on `:8000/mcp`**, which is AgentCore Runtime's MCP contract;
  `host_validation` is off because AgentCore proxies the request.
- **The schema is not committed.** `prune` copies `apps/gateway/dist/supergraph/api.graphql` (the
  gateway's `supergraph` target) into `schema/`, and `docker:build`, `serve` and the deploy's
  `build-functions` depend on it. `apps/gateway/test/mcp-operations.spec.ts` validates every
  operation against the composed schema, so a subgraph change that breaks a tool fails a test, not a
  conversation.

## The MCP App: `apps/`, and how a request reaches it

- **`apps/posts` is a build output**, not committed: `@nestposts/posts-app:build` writes the
  manifest and the single-file HTML there, and `prune` depends on it, so `serve`, `docker:build`
  and the deploy's `build-functions` always carry the current app. The server loads every
  `apps/<name>/.application-manifest.json` under its working directory at boot.
- **Apollo MCP Server serves an app only to a request whose URL names it**: `?app=posts` lists the
  app's tools (with `_meta.ui.resourceUri`), makes `execute` visible to the app alone and answers
  `resources/read` for `ui://widget/posts`. In that mode the six operations are listed but **not
  callable** (`Tool ListPosts not found`), so a client that wants both keeps two connections — the
  posts agent does. **`appTarget=mcp` has to be in the URL too**: a stateless server does not keep
  the UI capability a client declared at `initialize`, takes the request for the OpenAI target, and
  refuses `resources/read` with `no resource found for openai`.
- **AgentCore Runtime forwards neither the query string nor a sub-path.** Measured on dev:
  `…/invocations?qualifier=DEFAULT&app=posts` lists the plain tools, and `…/invocations/mcp` is an
  `UnknownOperationException`. What it forwards is an allowlisted
  `X-Amzn-Bedrock-AgentCore-Runtime-Custom-*` header, so the image runs **Caddy on `:8000` in front
  of the server on `127.0.0.1:8001`** (`config/Caddyfile`): a request carrying
  `X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App: posts` reaches the server as
  `?app=posts&appTarget=mcp`; any other passes unchanged. The value must be an app name
  (`^[a-z][a-z0-9-]*# @nestposts/mcp

The blog's posts as **MCP tools**: [Apollo MCP Server](https://www.apollographql.com/docs/apollo-mcp-server/)
over the gateway's composed API schema, one tool per operation in `operations/`. It is configured,
not written: `config/mcp.yaml` is the whole server.

| tool | operation | scope |
|---|---|---|
| `ListPosts` | `posts(first, after)` with authors and tags | `read:posts` |
| `GetPost` | `post(id)` in full | `read:posts` |
| `WhoAmI` | `me`, and an author's latest posts | — |
| `CreatePost` | `createPost` | `write:posts` |
| `UpdatePost` | `updatePost` | `write:posts` |
| `DeletePost` | `deletePost` | `write:posts` |

It also serves an **MCP App**, `posts` — `apps/posts-app`, built into `apps/` (see below) — whose
tools are `ChoosePostToEdit`, `EditPost`, `PreviewPost`, `SavePost` and `PublishPost`.

- **The tool descriptions are in the config** (`overrides.descriptions`), not in `#` comments above
  each operation: an SDL comment is a comment, and this repository writes none.
- **`mutation_mode: explicit`**: the six operations and the app's tools are the surface; the
  `execute` tool is on, because the app's Apollo Client runs its queries through it, and under this
  mode it refuses a mutation — what it runs, it runs as the caller. Its hint says it is the app's, and
  the posts agent leaves it out of what it offers its model.
- **It authenticates every request** (`transport.auth`): a signed JWT from the platform's issuer —
  whose discovery document the gateway serves at the issuer's root, and whose `issuer` must equal
  `servers` exactly — addressed to this server (`POSTS_MCP_RESOURCE`), carrying `read:posts` or
  `write:posts`; each tool also requires its own scope. The **validated token is passed through** to
  the gateway, which is why every Better Auth process accepts this server's audience.
- **Stateless streamable HTTP on `:8000/mcp`**, which is AgentCore Runtime's MCP contract;
  `host_validation` is off because AgentCore proxies the request.
- **The schema is not committed.** `prune` copies `apps/gateway/dist/supergraph/api.graphql` (the
  gateway's `supergraph` target) into `schema/`, and `docker:build`, `serve` and the deploy's
  `build-functions` depend on it. `apps/gateway/test/mcp-operations.spec.ts` validates every
  operation against the composed schema, so a subgraph change that breaks a tool fails a test, not a
  conversation.

), so the header cannot smuggle other parameters. A client sends the query
  and the header both: locally the binary reads the first, on AWS Caddy reads the second.
- **The base is `gcr.io/distroless/cc-debian12:debug`**, what Apollo's image runs on plus a busybox
  shell to start the two processes; Apollo runs in the foreground, so the container stops with it.

## Running it

```bash
nx serve @nestposts/mcp            # the native binary: APOLLO_MCP_SERVER, else `apollo-mcp-server` on PATH
nx docker:build @nestposts/mcp     # the image, for this machine's platform: what apps/web-e2e runs
```

The deploy builds its own, for the arm64 AgentCore runs (`infra/aws/agents`); `docker:build` names no
platform, so CI's amd64 runners build the image the browser suite starts without emulation.

`POSTS_MCP_PORT` (default `8000`) is the port the server listens on; the image sets `8001`, behind
Caddy.

Locally the binary runs natively and not in Docker: the issuer is a `localhost` origin, which a
container cannot reach under that name. `apps/web-e2e` runs the image anyway, and gives its Caddy one
site more, which forwards the web's port to the host (`ContainerStack.startPostsMcp`). `AUTH_ISSUER`, `POSTS_MCP_RESOURCE` and
`POSTS_MCP_GRAPHQL_ENDPOINT` default to the local stack; on AWS `infra/aws/agents` sets them.

The image carries Apollo's binary (`ghcr.io/apollographql/apollo-mcp-server`, multi-arch) and
Caddy's, with the config, the operations, the schema and the apps copied into `/data`, its working
directory.
