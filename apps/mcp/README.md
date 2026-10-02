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

- **The tool descriptions are in the config** (`overrides.descriptions`), not in `#` comments above
  each operation: an SDL comment is a comment, and this repository writes none.
- **`mutation_mode: explicit`**: the six operations are the surface; nothing ad hoc is executed.
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

## Running it

```bash
nx serve @nestposts/mcp            # the native binary: APOLLO_MCP_SERVER, else `apollo-mcp-server` on PATH
nx docker:build @nestposts/mcp     # the arm64 image AgentCore runs
```

Locally the binary runs natively and not in Docker: the issuer is a `localhost` origin, which a
container cannot reach under that name. `AUTH_ISSUER`, `POSTS_MCP_RESOURCE` and
`POSTS_MCP_GRAPHQL_ENDPOINT` default to the local stack; on AWS `infra/aws/agents` sets them.

The image is Apollo's own (`ghcr.io/apollographql/apollo-mcp-server`, multi-arch), with the config,
the operations and the schema copied into `/data`, its working directory.
