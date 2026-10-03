# `apps/chat-api`

The **`chat` subgraph**: the conversations people had with the platform's agents, listed and read
back, behind the gateway. A Nest application on Fastify and Yoga (schema-first, federation), with
`libs/chat` as its domain, the same Better Auth as every other subgraph, and the tenant a request
names.

```
Theo (ChatRecordingMiddleware) ─ recordChat, Bearer + x-tenant ─▶ gateway ─▶ chat-api ─▶ tenant_<x>.chats
web /theo ─ chats, chat { messages } ─▶ gateway ─▶ chat-api ─┬▶ tenant_<x>.chats
                                                            └▶ the agent's AgentCore Memory (checkpoints)
```

## The schema

| | |
|---|---|
| `chats(agentId, first)` | the caller's chats in this tenant, the most recent first |
| `chat(id)` | one of them, `null` for anybody else's |
| `Chat.messages` | the conversation, read from the agent's checkpoints: `USER`, `ASSISTANT` (with its tool calls) and `TOOL` |
| `IUser.chats` | the same list, on `me` — answered only for the caller's own user |
| `recordChat(input)` | what an agent calls before each run: starts the chat or continues it (title kept, moved to the top) |
| `renameChat(input)` / `deleteChat(id)` | the person's; deleting forgets the conversation in the agent's memory too |

Reads require `read:chats`, writes `write:chats` (`@RequireScopes`): a cookie holds both, and the
token the web delegates to Theo is asked for both. A chat id that is somebody else's is `NOT_FOUND`
everywhere, `recordChat` included, so an agent cannot be made to write into another person's chat.

## Messages are the agent's checkpoints

`AgentTranscripts` holds one `AgentCoreMemorySaver` (`@nestposts/langgraph-checkpoint-aws`) per agent
named in `CHAT_AGENT_MEMORIES` (`theo=<memory id>`), and reads a chat's latest checkpoint under the
same actor the agent wrote it with — `tenant:user`, the request's tenant and the chat's owner
(`AgentMemories.actorOf`). Nothing is copied: what the person sees when they reopen a conversation is
what the agent will resume from. An agent with no memory configured has chats with no messages.

## Configuration

| variable | default | |
|---|---|---|
| `CHAT_API_PORT` / `PORT` | `3003` | |
| `CHAT_AGENT_MEMORIES` | — | `agentId=memoryId`, comma separated: whose checkpoints a chat is read from |
| `AWS_REGION` | `us-east-1` | AgentCore Memory |
| `POSTGRES_URL`, `REDIS_URL`, `AUTH_SECRET`, `WEB_URL`, `GATEWAY_URL`, `AUTH_OAUTH_RESOURCES` | the platform's | the database, the cache and the Better Auth every subgraph shares |

## Tests

`test/chat-subgraph.spec.ts` boots the application on a database of its own (the real `migrate()`),
with AgentCore Memory faked in process (`FakeAgentCoreMemory`): recording and listing, the messages
read back from checkpoints the real saver wrote, a stranger refused on the root fields, the mutation
and `_entities`, and renaming and deleting — which removes the conversation's events. `apps/web-e2e`'s
`theo.spec.ts` lists, continues and isolates conversations through the browser, against a scripted
Theo that records them.

## Deployed

`ChatApi`, a streaming function behind its Function URL, called by the gateway
(`CHAT_SUBGRAPH_URL`), linked to `TheoMemory` (`infra/aws/compute`).
