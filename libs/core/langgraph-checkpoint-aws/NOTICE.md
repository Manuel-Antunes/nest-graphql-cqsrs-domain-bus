# langgraph-checkpoint-aws

This library is a TypeScript port of the AgentCore Memory checkpointer of
[**langgraph-checkpoint-aws**](https://github.com/langchain-ai/langchain-aws/tree/main/libs/langgraph-checkpoint-aws)
1.2.4 (commit `3f4e448`), by LangChain, Inc., MIT licensed (see `LICENSE`). Upstream is Python only;
LangGraph.js has no checkpointer on AgentCore Memory, and this is it.

## What came from upstream

`langgraph_checkpoint_aws/checkpoint/agentcore/` and `store/agentcore/`, module by module, keeping its wire format — the event
records are the same JSON with the same snake_case fields, so a session reads the same in either
language as far as the records go (the serialized values are each language's serde):

| upstream | here |
|---|---|
| `constants.py` — `EMPTY_CHANNEL_VALUE` and the errors | `agentcore/constants.ts` |
| `models.py` — `CheckpointerConfig`, `WriteItem`, `CheckpointEvent`, `ChannelDataEvent`, `WritesEvent` | `agentcore/models.ts`, the events as interfaces instead of pydantic models |
| `helpers.py` — `EventSerializer` | `agentcore/event-serializer.ts` |
| `helpers.py` — `AgentCoreEventClient`, `BedrockAgentCoreClientWithRetry` | `agentcore/agentcore-event-client.ts`, the retry on `RetryableConflictException` folded into `createEvent` |
| `helpers.py` — `EventProcessor`, `patch_orphan_tool_calls` | `agentcore/event-processor.ts` |
| `snapshot.py` — `AgentCoreSnapshotClient`, `writes_session_id` | `agentcore/agentcore-snapshot-client.ts` |
| `saver.py` — `AgentCoreMemorySaver` | `agentcore/agentcore-memory-saver.ts` |
| `store/agentcore/store.py` — `AgentCoreMemoryStore` | `agentcore/agentcore-memory-store.ts` |
| `helpers.py` — `convert_langchain_messages_to_event_messages` | `AgentCoreMemoryStore.conversationalOf` |

Both checkpoint formats came across: `legacy`, every checkpoint a set of blob events read by scanning
the session, and `snapshot`, every checkpoint complete in an event of its own named by metadata, its
pending writes in a session per checkpoint.

## What changed in the port

- **LangGraph.js's contract, not Python's.** `getTuple`, `list` (an async generator), `put`,
  `putWrites(config, writes, taskId)` and `deleteThread`; everything is async, so there is no executor
  around a sync implementation. `putWithWrites` stays, for a caller that buffers writes, without
  upstream's `DeferredSaver`.
- **`deleteThread(threadId, actorId)`.** An AgentCore session belongs to an actor, and `BaseCheckpointSaver`'s
  `deleteThread(threadId)` has no room for one; upstream defaults the actor to `""`, which the service
  refuses. The actor is a second parameter, and its absence throws `InvalidConfigError`.
- **Deleting lists from the start again after every page.** Upstream follows `nextToken` while it
  deletes the events the token was issued over.
- **The client is injected or built.** `client` takes any `send` of the data plane — which is how the
  specs run on `testing/fake-agentcore-memory`, and how an application hands over a client of its own;
  `clientConfig` builds one, with upstream's `x-client-framework` user agent.
- **Warnings are `process.emitWarning`**, where upstream used `warnings.warn` and `logging`.
- **Channel versions are LangGraph.js's integers**, not upstream's 32-digit-and-random-fraction
  strings: `compile({ checkpointer })` types its saver with numeric versions, and every saver of
  LangGraph.js (`MemorySaver`, `PostgresSaver`) counts them that way.

The two halves AWS documents for LangGraph came across: the saver, short-term memory — the
conversation and the graph's state, as blobs — and the store, long-term memory — messages put as
conversational events of `[actorId, sessionId]` for the memory's strategies to extract from, and the
records they extracted searched by namespace. The store's handlers are named for what they do
(`putMessage`, `getRecord`, `searchRecords`) instead of upstream's `_handle_*`, and its client keeps
upstream's four adaptive attempts.

## What was not ported

The Valkey and DynamoDB savers and stores, the Bedrock Sessions saver and `DeferredSaver`. Nothing here
needs them yet.
