# @nestposts/ai

The agents' runtime: A2A hosting and its extensions, the LangChain executor that runs a turn, the
files an agent works with, and the channels a reply is delivered through. This README is the design
record for the parts that were reorganised — the code carries no comments, so the reasons live here.

## Layout

```
src/
  a2a/
    domain/        the A2A contract: parts, extensions, the chat → A2A part encoder
    server/        Nest hosting: A2aModule, A2aRegistry, the protocol middleware, the executor wrapper
    langchain/     the LangChain binding: ReactAgentExecutor, A2aMiddleware, LangChainTaskStore
    testing/       A2aWire, the fixtures every A2A spec shares
  files/
    domain/        media kinds, sidecars, the attachment scope, attachment references
    analysis/      FileAnalysisService and its collaborators (vision, PDF, extraction)
    drive/         AttachmentDrive (the storage), DriveBackend (the deepagents filesystem), RunScope
    ingestion/     FileIngestionMiddleware, AttachmentIngestionService, blocks, eviction, the asset tool
    specialist/    FileAnalysisSpecialistAgent and its tools
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
  `https://a2ui.org/a2a-extension/a2ui/v0.8`. These URIs are a wire contract with the browser companion:
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
