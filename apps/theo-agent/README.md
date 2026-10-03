# @nestposts/theo-agent

**Theo**, the platform's assistant: an [AG-UI](https://docs.ag-ui.com) agent hosted on **Amazon
Bedrock AgentCore Runtime**, which the web's chat (`/theo`) talks to through CopilotKit. Theo manages
nothing itself. What concerns posts it hands to the posts agent (`apps/posts-agent`) over
[A2A](https://a2a-protocol.org), **as the person it is talking to**, with that person's own access
token, and tells them what the posts agent answered. It also searches the web — to research a post
before the posts agent writes it, or to answer about something recent.

```
browser ─ /theo (CopilotKit, headless hooks on libs/ui's chat components)
   │  AG-UI over /api/copilotkit, the session cookie
   ▼
apps/web ─ CopilotRuntime (v2) ─ HttpAgent ─Bearer (DelegatedAccessTokens)─┐
                                                                            ▼
                      AgentCore (JWT authorizer, aud = Theo; AG-UI, POST /invocations, SSE)
                                                                            │
apps/theo-agent ─ Nest application (Fastify), created in main.ts            │
  AgentCoreAgUiServer (libs/ai), handed the app ← AgUiRegistry.resolve ◀────┘
  PlatformAgentContexts (this app) ← IdentityResolver (libs/auth)
  TheoAgent (@AgUiAgent): A2aMiddlewareAgent over LangGraphAgent over
     createAgent(BASE_MODEL, search_the_web, copilotkitMiddleware) — send_message_to_a2a_agent
     │  A2A JSON-RPC, the same Bearer (bearerFetch),           │  MCP, SigV4 as Theo's role
     │  contextId = session = the thread                      │  (bedrock-agentcore/web-search)
     ▼                                                         ▼
AgentCore (JWT authorizer, aud = posts agent)          AgentCore Gateway (AWS_IAM) with the
  ─▶ apps/posts-agent ─▶ apps/mcp ─▶ apps/gateway        web-search connector: AgentCore Web Search
```

## One agent class, built on the first run

`TheoAgent` is an `@AgUiAgent` whose `agent` is a function. `libs/ai` calls it on the first run,
inside that caller's scope, because what it builds needs a credential: it reads the cards of the
agents named in `THEO_A2A_AGENTS` (`RemoteA2aAgents.connect`, with the caller's token — AgentCore
guards the card too), puts their roster in the system prompt, and builds the agent the way CopilotKit serves a LangGraph
one: a `createAgent` graph — `search_the_web` when there is a web search gateway (below),
`copilotkitMiddleware` for the client's tools, the chat recording and the long-term memory, the
AgentCore checkpointer and store — served by `@ag-ui/langgraph`'s `LangGraphAgent` over
`InProcessLangGraphClient`, inside an `A2aMiddlewareAgent` that adds `send_message_to_a2a_agent` to the
run's tools and sends each call to the posts agent. A build that fails — a posts agent still cold —
is built again on the next run.
The model is `@Inject('BASE_MODEL')`, a `useExisting` alias of the `ChatBedrockConverse` provider.

`main.ts` creates the Nest application (`NestFactory.create(AppModule, new FastifyAdapter())`) and
hands it to `AgentCoreAgUiServer`, which registers AgentCore Runtime's AG-UI
contract on `0.0.0.0:8080` — `POST /invocations` answered as server-sent events, `GET /ping` —
admitting a request only once `PlatformAgentContexts` (`src/agent-context/`, the `AgUiModule`'s
`context`) has read its bearer as a person of the platform.
`libs/ai/README.md` has the host, the in-process client, the A2A middleware loop and the
delegation.

## A fast model, and the web

Theo is a generalist: it needs to route well and answer quickly, not to write — the posts agent
writes. So its model is **Amazon Nova 2 Lite** (`us.amazon.nova-2-lite-v1:0`), measured on Theo's own
turn against the alternatives on Bedrock (us-east-1, median of three, the whole response):

| model | a turn that delegates | a short answer |
|---|---|---|
| Claude Sonnet 5.5 (the posts agent's) | 1.5 s | 1.4 s |
| GPT-5.6 Terra, reasoning `none` | 1.1 s | 1.1 s |
| Nova 2 Lite | 1.3 s | 1.7 s |
| Claude Sonnet 5 | 3.0 s | 2.1 s |

The difference between them is small next to the delegation itself, which is where a turn's time goes.

**Web search is AgentCore Web Search**, AWS's own index served as an MCP tool by an AgentCore Gateway
target with the `web-search` connector (`infra/aws/agents/web-search.ts`). Theo calls it with
`bedrock-agentcore`'s `WebSearchClient`, which speaks MCP to the gateway signed with SigV4 as Theo's
role, and `libs/ai`'s `WebSearchTool` hands the model up to eight passages, each with its page's title,
URL and date. The instructions tell Theo to search before a post that needs current facts is written,
to hand the posts agent what it found with every source's URL, and to ask for the post with a
"Sources" list and a preview — AWS requires the citations to reach whoever reads the result. Without
`THEO_WEB_SEARCH_URL`, Theo has no search tool and its instructions say nothing about one.

What was not used, and why: Claude's own `web_search` tool (LangChain's `tools.webSearch_…`) is not
available on Claude in Amazon Bedrock — Anthropic lists server tools as unsupported there; it is on
Claude Platform on AWS, which needs a separate subscription. GPT-5.6's built-in web search on Bedrock
took 80 to 115 s per question. Nova's Web Grounding (`nova_grounding`) answers in about 5 s, but
LangChain JS's `ChatBedrockConverse` (1.4.6) refuses a `systemTool`, and it puts a second model between
Theo and the results. AgentCore Browser is a remote Chrome for navigating pages, not a search.

## Authentication: the same person, all the way down

The web asks Theo with an access token its own Better Auth issued for whoever is signed in
(`DelegatedAccessTokens`, `libs/auth`), addressed to Theo, the posts agent and the posts MCP server;
`scripts/theo-console.mjs` asks the authorization server for the same token through the OAuth
authorization code grant. AgentCore's authorizer checks it against the issuer's discovery document and
Theo's audience; Theo reads it as the gateway reads a caller (`PlatformAgentContexts`: `libs/auth`'s
`IdentityResolver` for a request made of the invocation's headers, the same Better Auth on Postgres and
Redis), so it runs in the VPC, and refuses with an AG-UI `RUN_ERROR` (`401`) a token for another
resource or for nobody the platform knows. The token also says the organization the person is in
(`organization_id`), which is the run's tenant: the posts agent is reached in it (A2A's `tenant`), and
every memory below is kept under `tenant:user`, so the same person in two organizations has two
histories. Every run happens in the caller's context (`AgentRunContext`),
and every call to the posts agent carries that caller's token (`AgentRunContext.bearerFetch()`) — Theo holds no
credential of its own.

## What the client sees

A delegation is an AG-UI **subagent** of the tool call that made it: `SUBAGENT_STARTED` naming the
posts agent, the posts agent's answer streamed as text messages carrying the call's id as
`subagentRunId`, `SUBAGENT_FINISHED`, then the call's `TOOL_CALL_RESULT` and Theo's own answer. The
web's chat nests the first under the call — "Theo asked Posts Manager" — and, while the posts agent
works, the stream keeps moving, which is what keeps CloudFront's read timeout from cutting it.

## Memory, and the conversations the person comes back to

**The conversation is Theo's.** Its checkpoints live in Theo's AgentCore Memory
(`BEDROCK_AGENTCORE_MEMORY_ID`, `AgentMemories.checkpointerOf`): the actor is `tenant:user` and the
session the thread, so a conversation reopened tomorrow, on another microVM, resumes where it was, and
Theo feeds the graph only the messages its checkpoints do not hold (`libs/ai`, "AG-UI agents"). Beside
it is the **store** (`AgentMemories.storeOf`, `LongTermMemoryMiddleware`): what the person said and
Theo answered is put as conversational events, the memory's strategies extract preferences, facts and
summaries from them, and each model call recalls the person's preferences and facts in this
organization into the system message. Without a memory id both are in the process.

**Every conversation is a chat.** `ChatRecordingMiddleware` records each run's thread through the
gateway's `recordChat` (`CHAT_API_URL`), as the person, with the first question as its title — which is
what the web lists under "Conversations with Theo". The chat API reads a chat's messages back from
Theo's checkpoints, in the same memory; Theo is the only one writing them. Without `CHAT_API_URL`
nothing is recorded.

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
| `THEO_AGENT_MODEL_ID` | `us.amazon.nova-2-lite-v1:0` | a Bedrock model or inference profile |
| `THEO_WEB_SEARCH_URL` | — | the MCP URL of the AgentCore Gateway with the web search connector; unset, Theo cannot search |
| `THEO_AGENT_TEMPERATURE` | — | sent only when set: newer Claude models refuse it |
| `AWS_REGION` | `us-east-1` | Bedrock, AgentCore Memory, and the region web search is signed for |
| `BEDROCK_AGENTCORE_MEMORY_ID` | — | Theo's AgentCore Memory: its checkpoints and its long-term memory; unset, both live in the process |
| `CHAT_API_URL` | — | where conversations are recorded as chats — the gateway; unset, nothing is recorded |

## Running it locally

Beside the posts agent (its README says how), with `http://localhost:8080/` among the
`AUTH_OAUTH_RESOURCES` of every process, the migrator's included (it registers it), and AWS
credentials that can call Bedrock. To search, point `THEO_WEB_SEARCH_URL` at a stage's gateway
(`sst deploy` prints it as `agents.webSearch`) with credentials allowed `bedrock-agentcore:InvokeGateway`
on it:

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
the VPC's private subnets, linked to the posts agent, its memory (`TheoMemory`, 90 days, with the
preference, fact and summary strategies), the database, the cache and the auth secret. Its role may
invoke Bedrock models; the posts agent is called over HTTPS with the caller's bearer, and the gateway
(`CHAT_API_URL`) with the same bearer, which the web addresses to the gateway too.
