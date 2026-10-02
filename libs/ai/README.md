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
    callers/       AgentCaller, AgentCallers (the caller's scope), PlatformCaller(s), CallerBearerFetch
    agentcore/     AgentCoreHost: one agent on the AgentCore Runtime contract, its callers admitted
    lazy.ts        Lazy: built on first use, built again after a failure
  a2a/
    domain/        the A2A contract: parts, extensions, the chat → A2A part encoder
    server/        Nest hosting: A2aModule, A2aRegistry, the protocol middleware, the executor wrapper
    agentcore/     AgentCore Runtime hosting: AgentCoreA2aModule/Server over bedrock-agentcore's A2A app
    langchain/     the LangChain binding: ReactAgentExecutor, A2aMiddleware, LangChainTaskStore
    client/        RemoteA2aAgents, and send_message_to_a2a_agent (A2aDelegationTool) to delegate to them
    testing/       A2aWire, the fixtures every A2A spec shares
  ag-ui/
    server/        AgUiModule, AgUiRegistry, @AgUiAgent, LazyAgUiAgent
    agentcore/     AgentCoreAgUiModule/Server: POST /invocations (SSE) and GET /ping on :8080
    langchain/     LangChainAgUiAgent (LangGraph's v3 stream → AG-UI events), AgUiMiddleware, AgUiEvents
  files/
    domain/        media kinds, sidecars, the attachment scope, attachment references
    analysis/      FileAnalysisService and its collaborators (vision, PDF, extraction)
    drive/         AttachmentDrive (the storage), DriveBackend (the deepagents filesystem), RunScope
    ingestion/     FileIngestionMiddleware, AttachmentIngestionService, blocks, eviction, the asset tool
    specialist/    FileAnalysisSpecialistAgent and its tools
  mcp/
    apps/          MCP Apps in A2UI: McpAppTools, McpAppSurface, McpAppEndpoint
  web/             search_the_web (WebSearchTool) over AgentCore Web Search
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
- **Every turn runs as its caller.** The registry wraps every executor in `CallerScopedExecutor`,
  which runs the turn — and a lazy executor's build — inside `AgentCallers` (an `AsyncLocalStorage`
  of the call context's `User`, an `AgentCaller`). Anything the turn reaches asks `callers.currentAs(SomeUser)`;
  nothing threads the caller through LangChain's config, where a checkpoint could keep it.

`A2aAgentResolver.resolve(agent)` — by class, by `referenceId`, or the root agent with neither —
answers what a host serves: the card, the **hosted executor** (the very instance the registry's own
`DefaultRequestHandler` runs: extension-aware, caller-scoped, lazy) and the task store.

## Hosting an agent on Amazon Bedrock AgentCore Runtime

Two hosts serve the registry. `A2aProtocolMiddleware` serves it from a Nest HTTP application
(`/a2a/...`). `AgentCoreA2aServer` (`a2a/agentcore/`) serves one agent on AgentCore Runtime's A2A
contract: it resolves `AgentCoreA2aOptions.agent` with `A2aAgentResolver` and hands the result to
`bedrock-agentcore`'s `buildA2AApp`.

- **The card is the agent's, its interfaces the runtime's.** AgentCore serves JSON-RPC on `POST /`
  only, at the runtime's invocation URL (`AGENTCORE_RUNTIME_URL`, injected by the platform). So the
  card advertises a JSON-RPC interface there in A2A 1.0 and its 0.3 mirror
  (`duplicateInterfacesForLegacy`), which the SDK's server routes through its compat layer — and
  which AgentCore's documented shape still speaks.
- **Authentication is the registry's.** The SDK trusts every request — AgentCore's authorizer stands in
  front of the container — and builds no user. The server puts the registry's `resolveUser` in front
  of the SDK's app: a POST without a caller is a `401` before the executor runs, and the caller it
  resolved reaches `requestContext.context.user` — and `AgentCallers` — through a context builder
  wrapping the SDK's own (`bedrockCallContextBuilder`, which keeps AgentCore's headers in the call
  context's state). A run outside AgentCore is authenticated the same way.
- **`bedrock-agentcore` is ESM-only and has no `require` condition**, so an application that uses this
  folder bundles it: `bundledPackages: ['bedrock-agentcore']` in its `webpack.config.js` (`tools/webpack`).
  Its own imports — `express`, `@a2a-js/sdk` — stay external, so the bundle loads the same
  `@a2a-js/sdk` build as everything else; a `new Function('return import()')` was tried and fails under
  Vitest, whose modules run in a `vm` context.

`apps/posts-agent` is the first agent hosted this way.

## What every agent shares, whatever it speaks (`agents/`)

An agent served over A2A and one served over AG-UI are hosted the same way, and that part is one
piece of code, not two:

- **`AgentCaller`** is who a turn runs for — the A2A `User`'s shape, `isAuthenticated` and `userName`,
  which AG-UI has no word for and gets the same way. **`AgentCallers`** is its scope, an
  `AsyncLocalStorage`, provided by `AgentCallersModule` — global, so an application holds ONE, whichever
  protocol modules it imports; both `A2aModule` and `AgUiModule` import it. Code a turn reaches reads
  `callers.currentAs(PlatformCaller)`.
- **`PlatformCaller` / `PlatformCallers`** are the platform's identity as the caller, for every agent of
  this repository: the invocation's headers made into a request, `libs/auth`'s request-scoped
  `IdentityResolver` resolved for it (the gateway's way), and the `Identity` it answers kept with the
  access token it was read from. Each protocol module takes it as `resolveUser`. **`CallerBearerFetch`**
  is a `fetch` that sends the current caller's token — what an agent calling another agent uses.
- **`AgentCoreHost`** is the AgentCore Runtime host: `listen()` on the contract's port, closing with the
  application, and **admission** — the module's `resolveUser` run on the request's headers, a refusal
  before anything runs when there is no caller (unless `allowAnonymous`), and the request served inside
  the caller's scope. `AgentCoreA2aServer` (port 9000) and `AgentCoreAgUiServer` (port 8080) are its two
  subclasses: each says only how its protocol is served and how it refuses.
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
  caller's scope). `AgUiModule.registerAsync({ useFactory: → { agentProviders, resolveUser } })` and
  `AgUiRegistry.resolve(agent)` — by class, by id, or the only one.
- **`AgentCoreAgUiServer` is AgentCore Runtime's AG-UI contract**: `POST /invocations`, a
  `RunAgentInput`, answered as server-sent events; `GET /ping`, `HealthyBusy` while a run is in flight
  (so the session is kept) and `Healthy` otherwise, never with a moving `time_of_last_update`. A caller
  that does not resolve is a `401` whose body is an AG-UI `RUN_ERROR` (`UNAUTHORIZED`), with
  `WWW-Authenticate: Bearer`; a body that is not a `RunAgentInput` is a `400` `VALIDATION_ERROR`; a
  client that hangs up aborts the run. It is not `bedrock-agentcore`'s `BedrockAgentCoreApp`: that one
  cannot be closed, and exits the process when it cannot listen.
- **`LangChainAgUiAgent` runs a LangChain agent (`createAgent`) for one AG-UI run.** It converts the
  conversation (`AgUiMessages`) and streams the graph with LangGraph's v3 protocol, whose ONE ordered
  stream of events — `messages`, `tools`, `custom` — `AgUiProtocolTranslator` turns into AG-UI's:
  `TEXT_MESSAGE_*` for the model's text (a new message after each tool call it makes),
  `TOOL_CALL_START` as a call begins, `TOOL_CALL_ARGS`/`END` once its arguments are final,
  `TOOL_CALL_RESULT` when the tool answers or fails, and `RUN_STARTED`/`RUN_FINISHED`/`RUN_ERROR`
  around them. Its specs run it through `@ag-ui/client`'s own `runAgent`, which verifies the stream
  against the protocol and applies it: a stream the client would reject fails them.
  `@ag-ui/langchain` streams ONE model call and runs no tool of the server's; `@ag-ui/langgraph`
  drives a LangGraph Platform deployment through its SDK — neither runs a graph in this process.
- **The conversation is the client's.** AG-UI sends all of it on every run, so the agent keeps no
  checkpoint: a message a subagent said (`subagentRunId`) is left out — the call's result already
  carries it — `system`/`developer` messages become instructions, and a tool call nobody answered
  (the run that made it was stopped, the person typed on) gets a result saying so, because a model
  provider refuses a call without one.
- **`AgUiMiddleware`** (LangChain middleware) gives the model the frontend's tools — CopilotKit's
  `useFrontendTool` — and ends the run at the model's call to one (`jumpTo: 'end'`): the client runs
  it and sends the result in the next run. It appends the application's `context` and the
  conversation's instructions to the system message.
- **A tool speaks AG-UI too.** `AgUiEvents.emit(config, …events)` writes AG-UI events on LangGraph's
  `custom` stream, and the translator passes them through, in order. That is how a delegation shows
  its subagent.

## Delegating to an A2A agent (`a2a/client/`)

`RemoteA2aAgents.connect(urls, fetch)` reads each agent's card — through `@a2a-js/sdk`'s own card
resolver and JSON-RPC transport, both on the `fetch` given (`CallerBearerFetch`: the caller's token,
because AgentCore guards the card too) — and keeps a client per agent and a **roster** for the
prompt (names, descriptions, skills). `A2aDelegationTool.create(agents)` is
`send_message_to_a2a_agent({ agentName, task })`, the name and shape of CopilotKit's A2A middleware,
whose roster-and-tool pattern this is — run by the agent itself, as its caller, instead of by a
middleware that would hold no credential.

A delegation streams the remote task (`sendMessageStream`) and **is an AG-UI subagent of the call**:
`SUBAGENT_STARTED` (its `subagentRunId` is the tool call's id, `parentToolCallId` the same), the remote
agent's answer as `TEXT_MESSAGE_*` events carrying that `subagentRunId`, then `SUBAGENT_FINISHED` with
the result — or `SUBAGENT_ERROR`, and a result telling the model the agent could not be reached. The
conversation is one A2A context (`contextId` = the thread), and the thread is sent as AgentCore's
session id (`X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`, when it is long enough) so the remote
agent's turns land on the microVM that holds its memory of the thread. A remote task left
`input-required` comes back to the model as a question for the person.

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
