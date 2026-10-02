# @nestposts/langgraph-checkpoint-aws

LangGraph.js's checkpointer and store on **Amazon Bedrock AgentCore Memory** — a port of the Python
`langgraph-checkpoint-aws` (see `NOTICE.md`). Every checkpoint, channel value and pending write of a
thread is a blob of an event in an AgentCore session: the session is the thread, the actor is whoever
the thread belongs to. Nothing to provision but the memory resource itself.

```ts
import { AgentCoreMemorySaver } from '@nestposts/langgraph-checkpoint-aws';

const checkpointer = new AgentCoreMemorySaver(memoryId, {
  clientConfig: { region: 'us-east-1' },
  checkpointFormat: 'snapshot',
});

const agent = createAgent({ model, tools, checkpointer });

await agent.invoke(
  { messages: [new HumanMessage('Hello')] },
  { configurable: { thread_id: chatId, actor_id: `${tenant}:${userId}` } },
);
```

- **`thread_id` and `actor_id` are both required.** The actor is AgentCore's partition: two actors
  never share a session, whatever its id. A multi-tenant caller makes it composite —
  `tenant:user` is AgentCore's own recommendation for the pool model — so the same thread id in two
  tenants is two threads.
- **`checkpointFormat`**: `legacy` (the default, upstream's too) reads the latest checkpoint by
  scanning the whole session, so reading gets slower as the thread grows; `snapshot` stores each
  checkpoint complete and reads the latest in two `ListEvents` calls. A thread written in `snapshot`
  cannot be read in `legacy`, so every process reading it must agree. Snapshot mode needs
  `GetEvent` and `ListSessions` on top of `CreateEvent`, `ListEvents` and `DeleteEvent`.
- **`deleteThread(threadId, actorId)`** deletes the thread's events one by one (and, in `snapshot`,
  its pending-write sessions); AgentCore has no "delete session", and `DeleteEvent` is throttled per
  session, so a long thread takes a while.
- **`limit`** caps the blobs a legacy read decodes; a read cut short of the checkpoint throws
  `CheckpointReadLimitError` rather than answering with an older state.
- **`AgentCoreMemoryStore`** is the long-term half, as AWS integrates AgentCore Memory with
  LangGraph: `put([actorId, sessionId], key, { message })` saves a message as a conversational event,
  which the memory's strategies (user preference, semantic, summary) turn into records in the
  background; `search(['preferences', actorId], { query })` retrieves those records semantically,
  under the namespace their strategy writes to (`namespacePath`, or the exact `namespace` with
  `hierarchicalSearch: false`). It needs `RetrieveMemoryRecords` and `GetMemoryRecord` too, and a
  memory with strategies, or there is nothing to find.
- **Tests** run on `FakeAgentCoreMemory` (`@nestposts/langgraph-checkpoint-aws/testing/fake-agentcore-memory`),
  AgentCore Memory's data plane in a process with the limits measured against the service — 100
  payload items and 10 MB per event, newest events first, metadata filters, `clientToken` idempotence.
