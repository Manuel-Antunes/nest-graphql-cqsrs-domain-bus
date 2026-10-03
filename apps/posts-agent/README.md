# @nestposts/posts-agent

The blog's posts manager, as an [A2A](https://a2a-protocol.org) agent hosted on **Amazon Bedrock
AgentCore Runtime**. It lists and reads posts, publishes new ones, and edits or deletes the ones the
caller wrote — always **as the caller**, with the caller's own access token, through the posts MCP
server (`apps/mcp`), which calls the gateway.

```
A2A client ──Bearer──▶ AgentCore (JWT authorizer, aud = agent)
                         │  Authorization allowlisted
                         ▼
               apps/posts-agent  ─ Nest application (Fastify), created in main.ts
                 AgentCoreA2aServer (libs/ai), handed the app: /ping, /.well-known/agent-card.json, POST /
                   └─ A2aAgentResolver.resolve(PostsManagerAgent), @a2a-js/sdk's express handlers
                 PlatformAgentContexts (this app) ← IdentityResolver (libs/auth, the gateway's Better Auth)
                 PostsManagerAgent (@A2aAgent, its skills Skill entities)
                   ReactAgentExecutor over createAgent(BASE_MODEL, MCP tools + read_file, middleware)
                         │  the same Bearer (CallerBearerAuthProvider)
                         ▼
               AgentCore (JWT authorizer, aud = MCP) ──▶ apps/mcp (Apollo MCP Server)
                                                          │  the same Bearer (token passthrough)
                                                          ▼
                                                     apps/gateway ──▶ posts subgraph
```

Its callers are people, through an OAuth client (`scripts/agent-console.mjs`), and **Theo**
(`apps/theo-agent`), the AG-UI agent behind the web's chat, which hands it what concerns posts with
`send_message_to_a2a_agent`: the same person's token, the same A2A context for the whole of Theo's
conversation (its thread id), and that thread id as the AgentCore session, so a confirmation asked in
one turn is answered in the next by the same microVM.

## `main.ts` creates the app; `AgentCoreA2aServer` serves the agent on it

The agent is defined once, in `PostsManagerAgent`: the decorator holds its name, description, skills
and static card fields; the instance its security scheme (`card`, from the issuer's configuration) and
its executor — a function, which `libs/ai` builds on the first turn. `main.ts` creates the Nest
application — `NestFactory.create(AppModule, new FastifyAdapter())` — and hands it to
`AgentCoreA2aServer` (`libs/ai`, `a2a/agentcore/`), which registers AgentCore Runtime's A2A contract on
it (`app.use`) and listens on the contract's port:

1. it resolves the agent — `A2aAgentResolver.resolve(PostsManagerAgent)` answers its card, its
   **hosted executor** (extension-aware, context-scoped, lazy: the one the registry's own
   `DefaultRequestHandler` runs) and its task store;
2. it serves `GET /ping`, `GET /.well-known/agent-card.json` and JSON-RPC on `POST /`, both A2A 1.0
   and the 0.3 methods AgentCore's documented shape still speaks, with `@a2a-js/sdk`'s express handlers
   (the card declares a JSON-RPC interface of each version, at the runtime's URL —
   `AGENTCORE_RUNTIME_URL`, which the platform injects);
3. it runs the module's `context` on every invocation, so a POST without a valid bearer is a `401`
   before the executor runs, and the verified caller reaches the executor as
   `requestContext.context.user`.

`bedrock-agentcore` is ESM-only and publishes no `require` condition, so the webpack build **bundles**
it (`bundledPackages` in `webpack.config.js`); its own dependencies stay external like every other
package. The image installs the app's own dependencies only, which is why `@nestjs/platform-fastify` is
declared here.

## Authentication: the platform's identity, as the A2A user

AgentCore's JWT authorizer verifies every invocation against the platform's discovery document
(`<router>/.well-known/openid-configuration`, served by the gateway) and the agent's audience. The
container then reads the caller the way the gateway does: `PlatformAgentContexts`
(`src/agent-context/`, the `A2aModule`'s `context`) registers the invocation's request under a context
id of its own (`ContextIdFactory.create()`, `registerRequestByContextId`) and resolves `libs/auth`'s
request-scoped `IdentityResolver` for it, inside a MikroORM request context. That is the same Better
Auth every process holds — the organization plugin included, so its tables are the ones the migrator
maps — reading the bearer as `oauth-bearer-session` does: verified against the keys the jwt plugin
keeps in Postgres, for `AUTH_ISSUER` and the audiences in `AUTH_OAUTH_RESOURCES` (the agent's own, on
AWS), and answered as the user it was issued to — none for a user who no longer exists or is banned.
The `Identity` it answers becomes the A2A `User` as a `PlatformAgentContext` — `libs/ai`'s
`AgentContext`, the A2A `User`'s shape and what AG-UI agents run with too: the identity, its principal
as `userName`, the tenant, and the access token it was read from as the `credential`. A caller with no bearer, or one the platform does
not recognise, is a `401` before the executor runs.

The agent then **acts as the caller**: `libs/ai` runs every turn inside its context
(`AgentRunContext`), and `CallerBearerAuthProvider` — the MCP SDK's `OAuthClientProvider`, the
documented hook for a token that changes per request — hands the MCP client that caller's token
(`AgentRunContext.current()?.credential`) on every request. So the token must
also be addressed to the MCP server: a caller asks for it with both resources,
`resource=<agent>&resource=<mcp>`, and every Better Auth process accepts the MCP server's audience
(`AUTH_OAUTH_RESOURCES`), because the MCP server forwards the token to the gateway. Nothing ever acts
with a credential of the agent's own: what the agent may do is exactly what the person may do.

The MCP tools are listed on the first turn, with that caller's token — AgentCore refuses even
`tools/list` without one — and kept: the agent's `executor` is a function that loads them and builds
the LangChain agent, which `libs/ai` calls then, and calls again on the next turn if it failed. A
listing that comes back empty is tried again within the turn (`POSTS_MCP_CONNECT_ATTEMPTS`), and why
the server refused is logged: a new MCP microVM validates the first token against the issuer's
discovery, and the first turn of a conversation used to fail whole when that was slow.

## Skills: one list for the card and for the model

`PostsManagerAgent.skills` are `Skill` entities (`src/agent/skills/*.skill.ts`): `browse-posts`,
`publish-posts`, `curate-posts`, each a description and a procedure — which tool, in which order, what
to confirm. The registry advertises them on the card without their bodies; the LangChain agent mounts
them under `/skills/` (`SkillsBackend.mount`) and lists them in its system message, with `read_file`
as its one filesystem tool, so the model reads a procedure when a request needs it. The system prompt
keeps only what holds for every request — and the confirmation a deletion needs, which must not depend
on the model having read a file.

## The model

The agent injects `'BASE_MODEL'`, a `BaseChatModel`: `PostsManagerModule` builds one
`ChatBedrockConverse` and aliases it (`useExisting`), so a spec overrides the Bedrock model and the
agent gets the override.

## Memory

Both of the memories [AWS's LangGraph integration](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-integrate-lang.html)
describes, on the agent's AgentCore Memory (`BEDROCK_AGENTCORE_MEMORY_ID`), through `libs/ai`'s
`AgentMemories`:

- **The checkpointer** (`AgentCoreMemorySaver`, snapshot format) keeps every A2A context's checkpoints
  under the actor `tenant:user` and the context as the session, so a conversation outlives its microVM
  and resumes on any other; the same context id in another organization, or for another person, is
  another conversation.
- **The store** (`AgentCoreMemoryStore`, `LongTermMemoryMiddleware`) puts what the caller said and the
  agent answered as conversational events, and recalls the preferences and facts the memory's
  strategies extracted for that actor into the system message.

The tenant is the caller's organization, from the token (`organization_id`), and it is A2A's own: the
card served to a caller names their tenant, a request naming another is refused, and the task store
files tasks under the same actor (`libs/ai`, "Multi-tenancy"). Without a memory id both memories are
in the process (`MemorySaver`, `InMemoryStore`).

## Configuration

| variable | default | |
|---|---|---|
| `POSTS_AGENT_PORT` / `POSTS_AGENT_HOST` | `9000` / `0.0.0.0` | the A2A contract port; locally `127.0.0.1` |
| `POSTS_AGENT_URL` | — | the URL the card advertises; on AgentCore, `AGENTCORE_RUNTIME_URL` wins |
| `POSTS_AGENT_RESOURCE` | `http://localhost:9000/` | the audience a caller's token must carry |
| `AUTH_ISSUER` / `WEB_URL` | `http://localhost:4200` | the issuer a caller's token must name, and the card's OAuth URLs |
| `AUTH_OAUTH_RESOURCES` | `GATEWAY_URL` | the audiences a caller's token may carry — the agent's own, on AWS |
| `POSTGRES_URL`, `REDIS_URL`, `AUTH_SECRET`, `AUTH_URL` | the platform's | the Better Auth every process shares (`libs/auth`) |
| `POSTS_MCP_URL` | `http://localhost:8000/mcp` | the posts MCP server |
| `POSTS_MCP_CONNECT_ATTEMPTS` / `POSTS_MCP_RETRY_DELAY_MS` | `3` / `2000` | how many times a turn lists the tools before giving up, and the pause between |
| `POSTS_AGENT_MODEL_ID` | `global.anthropic.claude-sonnet-5-5` | a Bedrock model or inference profile |
| `POSTS_AGENT_TEMPERATURE` | — | sent only when set: newer Claude models refuse it |
| `AWS_REGION` | `us-east-1` | Bedrock and AgentCore Memory |
| `BEDROCK_AGENTCORE_MEMORY_ID` | — | AgentCore Memory: the checkpoints and the long-term memory; unset, both live as long as the microVM |

## Running it locally

The agent reads callers from the platform's Postgres (and Redis, when `REDIS_URL` is set), so it runs
beside the rest of the stack. The gateway is the issuer here as on AWS: run posts-api and the gateway with
`AUTH_ISSUER=http://localhost:4000` (the gateway serves `/api/auth` and the discovery documents) and
`AUTH_OAUTH_RESOURCES=http://localhost:4000/graphql,http://localhost:8000/mcp,http://localhost:9000/`,
run the migrator's `setup` with the same variables (it registers both resources and the
`agent-console` client), then `nx serve @nestposts/mcp` and the agent with AWS credentials that can
call Bedrock (`AWS_PROFILE=…`).

`scripts/agent-console.mjs` is the client: it signs in with an email and a password, runs the
authorization code grant with PKCE as the seeded public client `agent-console` (loopback redirect,
no consent screen), asks for a token addressed to the agent and to the MCP server, reads the card
and streams each message's answer. Several messages are one conversation.

```bash
node apps/posts-agent/scripts/agent-console.mjs "Who am I?" "List the latest posts."
node apps/posts-agent/scripts/agent-console.mjs \
  --issuer https://<router> --agent "<AgentCore invocation URL>/" \
  --agent-resource https://<router>/a2a/posts --mcp-resource https://<router>/mcp \
  "Publish a post titled 'Hello' saying we are live."
```

## Deployed

`infra/aws/agents`: an arm64 image built from what the host built — the bundle and the lockfile
`prune` cuts to this app's dependencies, which `build-functions` produces — plus `DOCKER_CONTAINER=1`,
which the SDK reads because AgentCore creates no `/.dockerenv` (this `Dockerfile`, its context this
directory), an
`aws.bedrock.AgentcoreAgentRuntime` with `serverProtocol: A2A`, a custom JWT authorizer, `Authorization`
on the header allowlist, and a role that may invoke Bedrock models and write the memory's events. It
runs in the VPC's private subnets, behind its security group, because the identity is read from the
database through the RDS Proxy and from the Valkey cache; Bedrock, AgentCore Memory and the MCP runtime
are reached through the NAT.
