# @nestposts/ai

The agents' runtime: what every agent shares whatever protocol it speaks (its callers, AgentCore
Runtime hosting), A2A hosting and its extensions, AG-UI hosting, the LangChain bindings that run a
turn over either, the A2A client an agent delegates to another with, the files an agent works with,
and the channels a reply is delivered through. This README is the design
record for the parts that were reorganised — the code carries no comments, so the reasons live here.

## Layout

```
src/
  agents/
    context/       AgentContext (who and where a run is for), AgentContexts (admission), AgentRunContext
    agentcore/     AgentCoreHealth: the contract's /ping, Healthy or HealthyBusy
    lazy.ts        Lazy: built on first use, built again after a failure
  a2a/
    domain/        the A2A contract: parts, extensions, the chat → A2A part encoder
    server/        Nest hosting: A2aModule, A2aRegistry, the protocol middleware, the executor wrapper,
                   A2aTenancy and TenantScopedCallContext (A2A's tenant, held to the caller's)
    agentcore/     AgentCoreA2aServer: AgentCore's A2A contract, registered on the app main.ts created
    langchain/     the LangChain binding: ReactAgentExecutor, A2aMiddleware, LangChainTaskStore
    client/        RemoteA2aAgents, and A2aDelegation: one call to one of them, as an AG-UI subagent
    testing/       A2aWire, the fixtures every A2A spec shares
  ag-ui/
    server/        AgUiModule, AgUiRegistry, @AgUiAgent, LazyAgUiAgent
    agentcore/     AgentCoreAgUiServer: POST /invocations (SSE) and GET /ping, on the app main.ts created
    langgraph/     InProcessLangGraphClient: @ag-ui/langgraph's LangGraphAgent over a graph in this process
    a2a/           A2aMiddlewareAgent: CopilotKit's A2A middleware loop, the A2A agents an AG-UI agent calls
  files/
    domain/        media kinds, sidecars, the attachment scope, attachment references
    analysis/      FileAnalysisService and its collaborators (vision, PDF, extraction)
    drive/         AttachmentDrive (the storage), DriveBackend (the deepagents filesystem), RunScope
    ingestion/     FileIngestionMiddleware, AttachmentIngestionService, blocks, eviction, the asset tool
    specialist/    FileAnalysisSpecialistAgent and its tools
  mcp/
    apps/          MCP Apps in A2UI: McpAppTools, McpAppSurface, McpAppEndpoint
  web/             search_the_web (WebSearchTool) over AgentCore Web Search
  checkpoint/      AgentMemories: the checkpointer and the store, on AgentCore Memory or in memory
  middleware/      LongTermMemoryMiddleware, SystemGuidance, EmptyToolInputMiddleware, …
  chats/           ChatApi and ChatRecordingMiddleware: every conversation recorded in the chat API
  channel/         ChannelResponseProcessor and its channels (in-memory, chatwoot/)
  backends/        SkillsBackend over StaticFilesBackend
```

## A2A extensions

Every extension is a class extending `BaseExtension<TPayload, TDependencies, TParams>`, and owns
everything about itself: its URI, its card descriptor, its payload types and codec, how it decorates
an outbound event, and whatever behaviour the turn asks of it (`ClientToolsExtension.toolsDeclaredFor`,
`HumanInTheLoopExtension.interruptOnFor`, `BrowserContextExtension.render`, …). `AgentExtensions` is
the set an agent declares; the registry publishes its descriptors on the card and the executors read
the same instances.

- **Nothing goes into `metadata` unless a declared extension defines it.** If a field is worth sending
  it is worth announcing on the card. `agent-extensions.spec.ts` asserts this as a rule.
- **URIs are repository-anchored and versioned** (`…/vaz-twin/a2a/extensions/<name>/v1`): never derived
  from a stage, and never redefined — a new meaning is a new version. A2UI keeps the published
  `https://a2ui.org/a2a-extension/a2ui/v0.9` — the version CopilotKit's A2UI renderer speaks. These URIs are a wire contract with the browser companion:
  changing one silently stops negotiation.
- **Activation is structural.** `ExtensionAwareAgentExecutor` activates, per turn, every extension the
  caller requested (`AgentExtensions.activateForTurn`) — the same call records it, so the response's
  `A2A-Extensions` header cannot disagree with what ran — and hands the delegate a decorating event bus
  only when something is active. Before this reorganisation it activated client-tools and deep-agent
  only, so human-in-the-loop, browser-context and prompt-augmentation could never activate: HITL pauses
  were never published and the browser context never reached the prompt.
- **Gating follows activation, for every extension.** Client tools, their prompt block and the envelope
  tool exist only for a caller that activated client-tools (the page-tools block used to be appended to
  every prompt, WhatsApp included); a HITL policy only for a caller that can answer it; prompt
  augmentation's instructions only for a caller that negotiated them.
- **Dependencies are for decoding.** `DeepAgentExtension` depends on `ClientToolsExtension` because the
  calls it labels (`write_todos`, `task`, `ask_user`, `review_action`) travel as client-tools payloads.
- **Message timestamps decorate history reads, not turns**, so a turn never activates them. The task
  store does not stamp them yet: the checkpoint time of a message is not part of the fold.
- `human-in-the-loop.assert.ts` pins, at compile time, that the HITL wire types and LangChain's
  `HITLRequest`/`HITLResponse`/`InterruptOnConfig` are the same shapes in both directions.

## Defining an agent once, and resolving it for a host

An agent is one class: `@A2aAgent({ id, name, description, card, skills })` states what is static —
its card's descriptive fields and, optionally, skills — and the instance adds what only DI knows:

- **`card`** (optional, on the instance): card fields that come from configuration — a security
  scheme whose URLs are the issuer's, the provider. It is merged last, over the module's defaults
  (`A2aModuleOptions.card`, now optional) and the decorator's `card`.
- **`executor`**: an `AgentExecutor`, or **a function that builds one**, synchronously or not.
  `LazyAgentExecutor` calls it on the first turn and keeps what it built; a build that fails is
  built again on the next turn. That is what an executor whose tools need the caller's credential
  needs — the posts agent lists its MCP tools with the first caller's token — and a `Promise`
  created in the constructor could not give: it would run at boot, as nobody, once.
- **`skills`** (on the decorator, the instance, or both): `A2aSkillConfig`s or **`Skill` entities**
  (`domain/skill.entity.ts`), the same objects the agent's LangChain graph loads its procedures from.
  The registry advertises an entity by its name, description, tags and examples, and never by its
  body: the body is an internal procedure, often naming tools a caller has no business seeing, and
  the card is public. The decorator's come first and an `id` is advertised once. One list is then
  both what the card promises and what the model can do: `SkillsBackend.mount(skills)` serves every
  `SKILL.md` under `/skills/` beside the agent's own files, and
  `SubAgentMiddleware.for({ backend, skills, tools: ['read_file'] })` lists them in the system
  message — name, description, path — for the model to read the one a request needs, when it needs
  it. Only the frontmatter is paid for on every turn.
- **Every turn runs in its caller's context.** The registry wraps every executor in
  `ContextScopedExecutor`, which runs the turn — and a lazy executor's build — inside
  `AgentRunContext` with the call context's `User`, the `AgentContext` the application built for the
  request. That is the only way it reaches a run: the graph's `configurable` carries who and where
  (`thread_id`, `actor_id`, `tenant`, `user_id`), never the credential, and nothing puts the
  `AgentContext` in the graph's runtime `context` — `copilotkitMiddleware` writes that `context` into
  the prompt as "App Context" whenever the state has none of its own.

`A2aAgentResolver.resolve(agent)` — by class, by `referenceId`, or the root agent with neither —
answers what a host serves: the card, the **hosted executor** (the very instance the registry's own
`DefaultRequestHandler` runs: extension-aware, caller-scoped, lazy) and the task store.

## Hosting an agent on Amazon Bedrock AgentCore Runtime

The application creates its Nest app in `main.ts` — `NestFactory.create(AppModule, new FastifyAdapter())`
— and hands it, created and not yet listening, to the host of its protocol:

```ts
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await new AgentCoreA2aServer(app, { agent: PostsManagerAgent, url }).listen(port, host);
```

The host registers AgentCore's contract on that app through Nest's own `app.use` — whichever adapter
the app was created with; nothing here builds or picks one — resolves the agent and the module's
options from the app's container on the first request (after `init`), and calls `app.listen`. So the
agent gets everything a Nest HTTP application has: its logger, its shutdown hooks, its HTTP spans.
`A2aProtocolMiddleware` still serves the registry from a Nest application under `/a2a/...`.

- **The card is the agent's, its interfaces the runtime's.** AgentCore serves JSON-RPC on `POST /`
  only, at the runtime's invocation URL (`AGENTCORE_RUNTIME_URL`, injected by the platform). So the
  card advertises a JSON-RPC interface there in A2A 1.0 and its 0.3 mirror
  (`duplicateInterfacesForLegacy`), and `@a2a-js/sdk`'s express handlers (`jsonRpcHandler`,
  `agentCardHandler`, both with `legacyCompat`) answer both — what AgentCore's documented shape and
  `@ag-ui/a2a`'s v0.3 client speak. The card handler is mounted with `use(path)`: it is a router that
  answers at its own root.
- **Who calls is the application's to say.** The module's `context` option (below) is run on the
  request: a POST with no context is a `401` before the executor runs, and the context it answered is
  the SDK's `userBuilder` — so it is the call context's `user`, wrapped by `TenantScopedCallContext`
  around the SDK's own `bedrockCallContextBuilder` (AgentCore's headers in the call context's state).
- **`bedrock-agentcore` is ESM-only and has no `require` condition**, so an application that uses this
  folder bundles it: `bundledPackages: ['bedrock-agentcore']` in its `webpack.config.js` (`tools/webpack`).
  Its own imports — `express`, `@a2a-js/sdk` — stay external, so the bundle loads the same
  `@a2a-js/sdk` build as everything else; a `new Function('return import()')` was tried and fails under
  Vitest, whose modules run in a `vm` context.

`apps/posts-agent` is the A2A agent hosted this way, `apps/theo-agent` the AG-UI one.

## What every agent shares, whatever it speaks (`agents/`)

An agent served over A2A and one served over AG-UI are hosted the same way, and that part is one
piece of code, not two:

- **`AgentContext`** is who and where a run is for: the A2A `User`'s shape (`isAuthenticated`,
  `userName`), the `tenant`, the `actorId` every memory is kept under, and the `credential` the agent
  acts with. `libs/ai` knows nothing about how one is made.
- **The application builds it, per request.** Each protocol module takes a `context` option —
  `(request) => Promise<AgentContext | undefined>`, the way `GraphQLModule` takes one — and the
  application's provider answers it: the agents here resolve `libs/auth`'s request-scoped
  `IdentityResolver` for the request under a context id of its own (`ContextIdFactory.create()`,
  `moduleRef.resolve`, the gateway's way) and the tenant with `TenantOrganizations`
  (`PlatformAgentContexts`, in each app). `AgentContexts.admits` is the rule both hosts apply: no
  context is a refusal, unless `allowAnonymous`.
- **`AgentRunContext` carries it where no parameter can.** Tools a graph runs read `runtime.context`,
  middleware `getConfig().context` — but LangChain's ambient config drops `context` inside a nested
  runnable (measured: `getConfig().context` is empty in a tool, even under a `runWithConfig` in
  `wrapToolCall`), and the MCP SDK calls its `OAuthClientProvider` from inside the tool. So each host
  runs the invocation `AgentRunContext.within(context, …)`, and `AgentRunContext.current()` is what an
  auth provider or `AgentRunContext.bearerFetch()` — the `fetch` an agent calls another agent with —
  reads.
- **`AgentCoreHealth`** answers the contract's `GET /ping`: `HealthyBusy` while an invocation runs (so
  AgentCore keeps the session) and `Healthy` otherwise.
- **`Lazy`** is a value built on first use and built again after a failed build: the A2A
  `LazyAgentExecutor` and the AG-UI `LazyAgUiAgent` are both one. An agent whose tools need the
  caller's credential — MCP tools listed with the first caller's token, a remote agent's card fetched
  with it — is declared as a function, built inside the first caller's scope.

## AG-UI agents (`ag-ui/`)

[AG-UI](https://docs.ag-ui.com) is the protocol between an agent and a user interface: a
`RunAgentInput` in — the thread, the run, **the whole conversation**, the frontend's tools, the
application's context — and a stream of typed events out. The SDK's own pieces are used as they are:
`@ag-ui/core` for the types and `RunAgentInputSchema`, `@ag-ui/encoder` for the wire (SSE, or protobuf
when the client asks for it), and `@ag-ui/client`'s `AbstractAgent` as what an agent IS.

- **An agent is declared like an A2A one.** `@AgUiAgent({ id, name, description })` on a provider whose
  `agent` is an `AbstractAgent`, or a function that builds one (`LazyAgUiAgent`, built in the first
  caller's context). `AgUiModule.registerAsync({ useFactory: → { agentProviders, context } })` and
  `AgUiRegistry.resolve(agent)` — by class, by id, or the only one.
- **`AgentCoreAgUiServer` is AgentCore Runtime's AG-UI contract**, registered on the app `main.ts`
  created (`new AgentCoreAgUiServer(app, { agent }).listen(port, host)`): `POST /invocations`, a
  `RunAgentInput`, answered as server-sent events; `GET /ping`, `HealthyBusy` while a run is in flight
  (so the session is kept) and `Healthy` otherwise, never with a moving `time_of_last_update`. A caller
  that does not resolve is a `401` whose body is an AG-UI `RUN_ERROR` (`UNAUTHORIZED`), with
  `WWW-Authenticate: Bearer`; a body that is not a `RunAgentInput` is a `400` `VALIDATION_ERROR`; a
  client that hangs up aborts the run. The run is subscribed inside `AgentRunContext.within(context)`.
  It is not `bedrock-agentcore`'s `BedrockAgentCoreApp`: that one cannot be closed, and exits the
  process when it cannot listen.
- **A LangGraph agent is served the way CopilotKit serves one: `@ag-ui/langgraph`'s `LangGraphAgent`,
  with `@copilotkit/sdk-js`'s `copilotkitMiddleware` in the graph.** `LangGraphAgent` is written for a
  LangGraph Platform deployment, through `@langchain/langgraph-sdk`'s `Client`; it takes the client as
  an option, and `InProcessLangGraphClient` is that client over a compiled graph in this process —
  the ten methods it calls (`assistants.search/get/getGraph/getSchemas`,
  `threads.get/create/getState/updateState/getHistory`, `runs.stream/cancel`), `runs.stream` being
  `graph.streamEvents(…, { version: 'v2' })` and a last `values` chunk.
  `InProcessLangGraphClient.agentOver(graph, { graphId })` is the agent. What comes with it is
  CopilotKit's whole translation: text, tool calls and results, reasoning, steps, interrupts, and a
  `MESSAGES_SNAPSHOT` of the checkpoint at the end of every run.
- **`getSchemas` declares `messages`, `tools`, `copilotkit` and `ag-ui` as the graph's input**, or
  `LangGraphAgent` filters the client's tools out of what it sends; `copilotkitMiddleware` reads them
  from `state.copilotkit.actions`, binds them to the model and ends the run at the model's call to one,
  which the client runs and answers in the next run.
- **The conversation is the checkpoint's.** `LangGraphAgent` reads the thread's state and sends the
  graph only the messages it does not hold, by id, and the snapshot it ends with gives the client
  those ids — so a resent conversation is not doubled. Two things make the ids agree in process:
  LangChain gives a streamed chunk the id `run-<run id>` only AFTER the model's callback has emitted
  it, and `LangGraphAgent` names the message by the chunk's id, so the client gives the chunk that id
  first, as LangChain will (`_updateId`, which `concat` reads); and `LangGraphAgent` answers a tool's
  result under a random message id, so the snapshot replaces the client's copy and the client keeps
  it after the messages it already had — the order on screen is the client's, the checkpoint's order
  is the model's.
- **A run that ends at a client tool's call leaves the call unanswered until the next run**, so the
  agent's checkpointer must not answer it in between: `AgentMemories.FOR_CLIENT_TOOLS` turns off
  `AgentCoreMemorySaver`'s `patchOrphanToolCalls`, which otherwise reads the call back answered
  "interrupted" and makes the client's result a second answer Bedrock refuses. Theo's checkpointer is
  built with it; a call the person moved on from is closed by `DelegatedMessages` instead.
- **Every run is configured with who and where**, read from `AgentRunContext`: the graph's
  `configurable` is `{ thread_id, actor_id, tenant, user_id }` — what the checkpointer, the store and
  every middleware scope by. The client puts no `context` on a run.

## Delegating to an A2A agent (`a2a/client/`)

`RemoteA2aAgents.connect(urls, fetch)` reads each agent's card — through `@a2a-js/sdk`'s own card
resolver and JSON-RPC transport, both on the `fetch` given (`AgentRunContext.bearerFetch()`: the caller's token,
because AgentCore guards the card too) — and keeps a client per agent and a **roster** for the
prompt (names, descriptions, skills). `new A2aDelegation(agent, { toolCallId, contextId, a2ui,
signal, emit }).send(task)` is one call to one of them.

A delegation streams the remote task (`sendMessageStream`) and **is an AG-UI subagent of the call**:
`SUBAGENT_STARTED` (its `subagentRunId` is the tool call's id, `parentToolCallId` the same), the remote
agent's answer as `TEXT_MESSAGE_*` events carrying that `subagentRunId`, then `SUBAGENT_FINISHED` with
the result — or `SUBAGENT_ERROR`, and a result telling the model the agent could not be reached. The
conversation is one A2A context (`contextId` = the thread), and the thread is sent as AgentCore's
session id (`X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`, when it is long enough) so the remote
agent's turns land on the microVM that holds its memory of the thread. A remote task left
`input-required` comes back to the model as a question for the person.

**The remote agent is reached in the caller's tenant.** `connect(urls, fetch, { tenantOf })` keeps the
agents it reached per tenant (`reach(name)`): each card is read as the caller, and the card a
multi-tenant agent serves names the caller's tenant (`AgentInterface.tenant`), which `@a2a-js/sdk`'s
`TenantTransportDecorator` then puts on every request — so a delegation from `acme` is an `acme`
request, never the tenant of whoever happened to call first.

## An AG-UI agent that calls A2A agents (`ag-ui/a2a/`)

`A2aMiddlewareAgent` is `@ag-ui/a2a-middleware`'s `A2AMiddlewareAgent` loop, written on
`AbstractAgent` without extending it: the package's agent builds one unauthenticated client per URL
in its constructor, sends blocking `message/send`, keeps only the first text part and replaces the
system prompt with its own, and it would bring `@a2a-js/sdk` 0.2 and `ai` 4 into the bundle. The loop
is the same:

- `send_message_to_a2a_agent({ agentName, task })` — the name and shape of CopilotKit's — is added to
  the run's tools as a **client** tool, its `agentName` an enum of the agents' names, so the
  orchestrator (`LangGraphAgent`, `copilotkitMiddleware`) ends its run at the call;
- each call is sent by `A2aDelegation` — streamed, with the caller's token, the thread as the A2A
  context, the client's A2UI catalogs in the message metadata — its answer streamed to the client as
  an AG-UI subagent of the call, and its result is a `TOOL_CALL_RESULT` and a tool message;
- the orchestrator runs again with its snapshot and those results, until it answers without
  delegating (eight rounds at most).

The client sees ONE run: the orchestrator's `RUN_STARTED`/`RUN_FINISHED` are the agent's own, its
intermediate snapshots are held back, and the last one goes out with what the remote agents said
put back in (`DelegatedMessages.withDelegated`), because a `MESSAGES_SNAPSHOT` removes from the
client whatever it does not list. Raw events and state snapshots are not forwarded: their metadata is
the graph's configuration. The orchestrator is handed the conversation without what remote agents
said, without the messages only the client draws (`activity`), and with a result for every call the
person moved on from — `DelegatedMessages.forOrchestrator` — because a model provider refuses a call
without one. A failure is a `RUN_ERROR` naming it, and the run is traced in Langfuse under the agent's
name, its session the thread.

## MCP Apps in A2UI (`mcp/apps/`)

A2UI's "MCP Apps in A2UI" pattern, over this repository's agents: an MCP App — an application an MCP
server publishes as a `ui://` resource for some of its tools — reaches the person as a component of
an A2UI surface, `McpApp`, that the agent which called the tool answers with, and the client
renders. What changes from A2UI's own sample is that **the surface never carries the HTML**: it names
the server, the resource, the tool, its input and its result, and the host reads the resource itself.
Embedded, a 1 MB single-file bundle would travel through every model context on the way.

- **`McpAppTools`** turns an MCP server's tools into what an agent offers its model. From the server's
  raw listing (`definitionsOf`: a tool whose `_meta.ui.resourceUri` names a resource is an app
  tool, and a read-only one **opens** the app) it wraps the LangChain MCP adapter's tools
  (`openers`): the model reads the tool's text and a line saying the app is on screen; the
  `ToolMessage`'s artifact carries the placement (`mcpApp`). An app tool that changes data is the
  app's own button and is never offered. The adapter keeps `structuredContent` and `_meta` in its
  artifact; LangGraph's v3 stream (`run.toolCalls`) gives the content alone, which is why the artifact
  is read where the tool returns — in `A2aMiddleware` — and not off the stream.
- **A2UI is negotiated per turn, by the catalogs the client renders.** The client declares them as
  `a2uiClientCapabilities.supportedCatalogIds` in the message's `metadata` (A2UI's own rule, and a
  header AgentCore might not forward is not relied on). `ReactAgentExecutor` opens an `A2uiTurn`
  on the first id; `A2aMiddleware` offers the app tools only on such a turn and turns each placement
  into the surface's messages (`McpAppSurface.messages`: `createSurface` on that catalog, then
  `updateComponents` with the root `McpApp`); the executor puts them in the final message as
  `application/json+a2ui` data parts, one A2UI message per part. A turn without the capability
  answers in prose with the plain tools.
- **The delegating side reads the catalogs off its own caller.** `A2aDelegation` looks in the AG-UI
  run's context (`config.context.agUi`, which LangChain hands every tool) for the A2UI schema entries
  CopilotKit's provider sends — `{ catalogId, components }` — and declares to the remote agent the
  ones that include `McpApp` (`A2uiCapabilities.ofCaller`), with the extension requested as well.
  It collects the A2UI parts of the answer and returns `{ a2ui_operations, answer }`, the shape
  CopilotKit's A2UI middleware renders from any tool result; a caller that draws no `McpApp` makes
  the delegation exactly what it was.
- **`McpAppEndpoint`** addresses an app on a server: `?app=<name>&appTarget=mcp` for a server reached
  directly, and `X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App` for one behind AgentCore, which
  forwards no query string (`apps/mcp/README.md`).

## Searching the web (`web/`)

`WebSearchTool.create(client)` is a LangChain tool, `search_the_web`, over **AgentCore Web Search**:
AWS's own web index, served as the `WebSearch` MCP tool of an AgentCore Gateway target with the
`web-search` connector. The client is `bedrock-agentcore`'s `WebSearchClient`
(`bedrock-agentcore/web-search`), which runs the MCP handshake and the call signed with SigV4 and
normalizes the results; the application builds it with the gateway's URL and region and injects it, so
the library reads no environment and a spec hands it a stub.

The tool asks for at most `MAX_RESULTS` (8) results, optionally published after a date the model
gives (connector `1.2.0`), and answers the model with each passage under `[n] title`, its URL and its
date; the response is the artifact. Whatever is written from a search must show its sources — AWS's
terms for the service — which is the calling agent's instruction to follow and the web's to display.

## Multi-tenancy: the tenant is the caller's organization

Every agent here is multi-tenant in the [A2A sense](https://a2a-protocol.org/latest/topics/multi-tenancy):
one runtime serves every organization, and everything a turn touches — the tools it calls, the
checkpoints it reads, the memories it recalls, the tasks it lists — is scoped by the tenant **and** the
person. The tenant is not something a request asserts; it is read off the caller:

- **The token says the organization.** The web's delegated token carries `organization_id`, the
  person's active organization (`libs/auth`), which `oauth-bearer-session` makes the session's.
  Each agent's `PlatformAgentContexts` resolves it to the tenant — the organization's slug, `root`
  without one (`TenantOrganizations.tenantOf`) — and the `AgentContext` keeps it beside the identity
  and the token; `actorId` is `tenant:user`, AWS's recommendation for pooled AgentCore Memory.
- **A2A's own `tenant` field, held to the caller's.** `AgentCoreA2aServer` serves the card per caller,
  with `tenant` set to theirs (`agentCardHandler`, never cached), and builds every call's context as a
  `TenantScopedCallContext`: `context.tenant` is the caller's when the request names none, and a
  request naming another (`setTenant`) is refused as malformed. `A2aTenancy.actorOf(tenant, caller)` is
  what `ReactAgentExecutor` configures the graph with and `LangChainTaskStore` files tasks under.
- **AG-UI and AgentCore have no tenant of their own.** AG-UI's `RunAgentInput` has no such field and
  AgentCore's session is one id; the tenant rides the caller, and the actor, as above.
- **Tools act as the caller.** The MCP tools and delegated agents get the caller's token, and so the
  caller's organization; the gateway names the tenant from it (`x-tenant`) when the call names none.

## Memory: a checkpointer and a store (`checkpoint/`, `middleware/`)

An agent has the two memories [AWS's LangGraph integration](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-integrate-lang.html)
describes, both from `@nestposts/langgraph-checkpoint-aws` (a port of `langgraph-checkpoint-aws`):

- **Short-term: the thread's checkpoints.** `AgentMemories.checkpointerOf({ memoryId, region })` is
  an `AgentCoreMemorySaver` (snapshot format) on the agent's AgentCore Memory, or a `MemorySaver` when
  there is none. A turn on another microVM, a day later, resumes the thread where it was; the actor is
  `tenant:user` and the session the thread, so the same thread id in another tenant is another
  conversation.
- **Long-term: what the memory extracts.** `AgentMemories.storeOf(...)` is an `AgentCoreMemoryStore`
  (or an `InMemoryStore`), and the graph is compiled with it beside the checkpointer —
  `createAgent({ checkpointer, store })`, the guide's `create_react_agent(checkpointer=…, store=…)`.
  `LongTermMemoryMiddleware.create({ recall })` is the guide's model hooks as LangChain v1 middleware,
  and reads the graph's store (`runtime.store`) as the guide's `pre_model_hook(…, *, store)` does: it
  puts what the person said, and the final answer (the guide's optional post-model hook), as
  conversational events under `(actor_id, thread_id)` — the input of the memory's strategies
  (preferences, facts, summaries, `infra/aws/agents/memories.ts`) — and before each model call searches
  the `recall` namespaces under the actor (`("preferences", actor_id)`, `("facts", actor_id)`, limit 5)
  with the person's last question, appending what it finds to the system message under
  `## What you remember about this person`. Two departures, both deliberate: the person's messages are
  put once per run (`beforeAgent`) rather than before every model call, which in a tool loop would put
  the same message again on each call; and the recall goes to the system message, not the person's —
  the guide leaves the placement open. A graph compiled without a store remembers nothing, and a
  failed recall is no memory, never a failed turn.

## Chats: every conversation recorded in the chat API (`chats/`)

The list of a person's conversations is `apps/chat-api`'s — a `Chat` per thread, owned by the person,
in the tenant's schema — and the agent is what fills it: `ChatRecordingMiddleware` calls
`ChatApi.record` before each run (`recordChat` on the gateway, as the caller, with their tenant as
`x-tenant`), with the thread as id, the agent's id and the thread's first question as the title. A
recording that fails is logged; the run goes on. What a chat SAYS is the checkpoints': the chat API
reads them back from the same AgentCore Memory, so the agent holds the conversation and nobody keeps
a second copy.

## The LangChain middleware and the system message

`A2aMiddleware` and `FileIngestionMiddleware` extend the system message through `SystemGuidance.append`
(a `SystemMessage.concat` with a blank line between sections). They never write `systemPrompt`, which
is a lossy projection upstream deprecates, and never mutate the request's `SystemMessage` — the A2A
middleware used to, so a caller's instructions accumulated once per model call.

## Files

One submodule for everything an agent does with a file: storing it, analysing it, and exposing it to
LangChain.

- **Storage is `@nestjs/storage`, through the asset model.** `AttachmentDrive` injects the app's
  `Storage`; bytes are stored with `Attachment.fromBuffer(…).store(storage, { disk, path })` and the
  sidecar's `asset` is the resulting `StoredAttachment` (`disk`, `path`, `originalName`, `size`,
  `extname`, `mimeType`) — what `Attachment.restore` reads back. No URL is persisted: a signed URL
  expires, so only a public disk's URL is ever attached to a block, and the durable identity is the key.
- **Where a conversation's files live** is `AttachmentScope.rootOf(configurable)`:
  `agents/<scope>/<user>/file-analysis/<thread>`, from the run's `configurable` only, so the writer
  (ingestion, `DriveBackend`) and the readers (`prepare_document_asset`, the specialist's tools, inside
  `task` sub-agents too) always agree.
- **`DriveBackend`** is deepagents' filesystem over a `StorageDisk`. Listings are flat and recursive in
  `@nestjs/storage`, so directories are derived from the keys; the storage's own key rules refuse `..`.
- **The checkpoint never keeps what the drive already has** (ported from `gmpa-monorepo-migrate`,
  `d26acce48 fix: evict file blob duplication`). `PostgresSaver` writes the whole `messages` list again
  on every step that changes it, and staging's disk filled that way (17 GB, 97% attachment copies).
  So, once a turn ends (`afterModel`, never while tool calls are pending):
  - each attachment block is pruned to its durable half (path, name, kind, MIME type, public URL);
    `wrapModelCall` re-reads the marker, caption and analysis off the sidecar on later turns;
  - every base64 block `read_file` put in a `ToolMessage` becomes a placeholder naming the file
    (`BinaryBlockEviction`, with `lc_kwargs` rewritten too, or the serializer would keep the bytes);
  - a file already ingested under the same `sourceId` is reused off its sidecar — no second write, no
    second STT/vision call.
- A failed write is retried and, if it never lands, the file is not advertised: no sidecar, and a
  marker asking for a resend. A remote file is downloaded with a timeout, a size cap and http(s) only.

## Channels

`ChannelResponseProcessor` is one abstract class: the stream-driven orchestration every channel shares
(`send_text` calls, `send_audio` results, interrupts, the zero-deliverable fallback) and the primitives
a channel implements.

`ChatwootChannelResponseProcessor` is request-scoped and is called by a Chatwoot agent bot. It
authenticates as that bot by forwarding the credential the bot called with — `RequestCredentials.of`
the request, plus its `x-tenant` — to the gateway, and delivers through the Chatwoot subgraph's
`createANewMessageInAConversation`, `toggleTypingStatusInConversation` and `updateConversationLastSeen`,
the same builders and services Chatwoot's REST routes use. The credential is the bot's platform
access token: every account-bound agent bot is an OAuth client of the platform
(`chatwoot-agent-bot-<id>`, its secret the bot's Chatwoot token, created by trigger), and its
client-credentials token carries `agent_bot_id` and `organization_id`, which the gateway verifies before
it hands the Chatwoot subgraph the bot's own access token. A request with no credential is refused rather than sent anonymously.
