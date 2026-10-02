# @nestposts/theo-agent

**Theo**, the platform's assistant: an [AG-UI](https://docs.ag-ui.com) agent hosted on **Amazon
Bedrock AgentCore Runtime**, which the web's chat (`/theo`) talks to through CopilotKit. Theo manages
nothing itself. What concerns posts it hands to the posts agent (`apps/posts-agent`) over
[A2A](https://a2a-protocol.org), **as the person it is talking to**, with that person's own access
token, and tells them what the posts agent answered.

```
browser ─ /theo (CopilotKit, headless hooks on libs/ui's chat components)
   │  AG-UI over /api/copilotkit, the session cookie
   ▼
apps/web ─ CopilotRuntime (v2) ─ HttpAgent ─Bearer (DelegatedAccessTokens)─┐
                                                                            ▼
                      AgentCore (JWT authorizer, aud = Theo; AG-UI, POST /invocations, SSE)
                                                                            │
apps/theo-agent ─ Nest application context                                 │
  AgentCoreAgUiServer (libs/ai) ← AgUiRegistry.resolve(TheoAgent) ◀────────┘
  PlatformCallers (libs/ai) ← IdentityResolver (libs/auth)
  TheoAgent (@AgUiAgent): LangChainAgUiAgent over createAgent(BASE_MODEL, send_message_to_a2a_agent)
     │  A2A JSON-RPC, the same Bearer (CallerBearerFetch), contextId = session = the thread
     ▼
AgentCore (JWT authorizer, aud = posts agent) ─▶ apps/posts-agent ─▶ apps/mcp ─▶ apps/gateway
```

## One agent class, built on the first run

`TheoAgent` is an `@AgUiAgent` whose `agent` is a function. `libs/ai` calls it on the first run,
inside that caller's scope, because what it builds needs a credential: it reads the cards of the
agents named in `THEO_A2A_AGENTS` (`RemoteA2aAgents.connect`, with the caller's token — AgentCore
guards the card too), puts their roster in the system prompt, gives the model one tool,
`send_message_to_a2a_agent` (`A2aDelegationTool`), and wraps the LangChain agent in a
`LangChainAgUiAgent`. A build that fails — a posts agent still cold — is built again on the next run.
The model is `@Inject('BASE_MODEL')`, a `useExisting` alias of the `ChatBedrockConverse` provider.

`main.ts` boots an application context and starts `AgentCoreAgUiServer`: AgentCore Runtime's AG-UI
contract on `0.0.0.0:8080` — `POST /invocations` answered as server-sent events, `GET /ping` —
admitting a request only once `PlatformCallers` has read its bearer as a person of the platform.
`libs/ai/README.md` has the host, the translation from LangGraph's stream to AG-UI's events and the
delegation.

## Authentication: the same person, all the way down

The web asks Theo with an access token its own Better Auth issued for whoever is signed in
(`DelegatedAccessTokens`, `libs/auth`), addressed to Theo, the posts agent and the posts MCP server;
`scripts/theo-console.mjs` asks the authorization server for the same token through the OAuth
authorization code grant. AgentCore's authorizer checks it against the issuer's discovery document and
Theo's audience; Theo reads it as the gateway reads a caller (`PlatformCallers`: `libs/auth`'s
`IdentityResolver` for a request made of the invocation's headers, the same Better Auth on Postgres and
Redis), so it runs in the VPC, and refuses with an AG-UI `RUN_ERROR` (`401`) a token for another
resource or for nobody the platform knows. Every run happens in the caller's scope (`AgentCallers`),
and every call to the posts agent carries that caller's token (`CallerBearerFetch`) — Theo holds no
credential of its own.

## What the client sees

A delegation is an AG-UI **subagent** of the tool call that made it: `SUBAGENT_STARTED` naming the
posts agent, the posts agent's answer streamed as text messages carrying the call's id as
`subagentRunId`, `SUBAGENT_FINISHED`, then the call's `TOOL_CALL_RESULT` and Theo's own answer. The
web's chat nests the first under the call — "Theo asked Posts Manager" — and, while the posts agent
works, the stream keeps moving, which is what keeps CloudFront's read timeout from cutting it.

The conversation is the client's: AG-UI sends all of it on every run, and Theo keeps no checkpoint.
The posts agent keeps its own, per A2A context: Theo's thread is that context and the AgentCore session
it is invoked in, so the posts agent remembers what it asked — "are you sure?" — when the person
answers in the next turn.

## Configuration

| variable | default | |
|---|---|---|
| `THEO_AGENT_PORT` / `THEO_AGENT_HOST` | `8080` / `0.0.0.0` | the AG-UI contract port |
| `THEO_A2A_AGENTS` | `http://localhost:9000/` | the A2A agents Theo may hand a task to, comma separated — the posts agent's invocation URL on AWS |
| `AUTH_ISSUER` / `WEB_URL` | `http://localhost:4200` | the issuer a caller's token must name |
| `AUTH_OAUTH_RESOURCES` | `GATEWAY_URL` | the audiences a caller's token may carry — Theo's own, on AWS |
| `POSTGRES_URL`, `REDIS_URL`, `AUTH_SECRET`, `AUTH_URL` | the platform's | the Better Auth every process shares (`libs/auth`) |
| `THEO_AGENT_MODEL_ID` | `global.anthropic.claude-sonnet-5-5` | a Bedrock model or inference profile |
| `THEO_AGENT_TEMPERATURE` | — | sent only when set: newer Claude models refuse it |
| `AWS_REGION` | `us-east-1` | Bedrock |

## Running it locally

Beside the posts agent (its README says how), with `http://localhost:8080/` among the
`AUTH_OAUTH_RESOURCES` of every process, the migrator's included (it registers it), and AWS
credentials that can call Bedrock:

```bash
npx nx serve @nestposts/theo-agent
node apps/theo-agent/scripts/theo-console.mjs "Who am I?" "List my latest posts."
node apps/theo-agent/scripts/theo-console.mjs \
  --issuer https://<router> --agent "<Theo's AgentCore invocation URL>" \
  --agent-resource https://<router>/agui/theo \
  --posts-agent-resource https://<router>/a2a/posts --mcp-resource https://<router>/mcp \
  "Publish a post titled 'Hello' saying we are live."
```

The console signs in as the seeded public client `agent-console`, asks for a token addressed to the
three resources, and runs each message as one conversation, printing the posts agent's words dimmed.
The web's `/theo` is the other client: `THEO_AGENT_URL` and `THEO_AGENT_AUDIENCES` there.

## Tests

`test/theo-agent.spec.ts` runs the whole chain in one process: this application and the posts
agent's, each with its Better Auth on the spec's own database, both models scripted and the posts
agent's MCP tools a stand-in. An `@ag-ui/client` `HttpAgent` with a real token of a real user asks
Theo; the AG-UI stream is verified by the client as it is applied, and the spec checks the
delegation's events, the messages the client keeps, that the posts agent ran as the same user with the
same token, and that a token for another resource, or for nobody, is refused before any model runs.
`apps/web-e2e`'s `theo.spec.ts` drives the web's chat in a browser against a scripted Theo.

## Deployed

`infra/aws/agents`: an arm64 image built from what the host built (this `Dockerfile`, its context this
directory, after `prune`), an `aws.bedrock.AgentcoreAgentRuntime` with `serverProtocol: AGUI`, a custom
JWT authorizer for Theo's audience (`<router>/agui/theo`), `Authorization` on the header allowlist, in
the VPC's private subnets, linked to the posts agent, the database, the cache and the auth secret. Its
role may invoke Bedrock models; the posts agent is called over HTTPS with the caller's bearer.
