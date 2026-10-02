# `@nestposts/chat`

A **chat** is a person's conversation with one of the platform's agents, as a domain entity: its id is
the agent's thread, it belongs to a `User` (`public.users`) and names the agent it is with (`theo`),
and it has a title and the time it was last spoken in. It is a TENANT table (`tenant_<x>.chats`): the
same person in two organizations has two lists, as the agents' memories are kept per
organization too.

```
src/
  domain/chat/
    schemas/   ChatIdSchema (a UUID), AgentIdSchema, ChatTitleSchema (CHAT_TITLE_MAX_LENGTH)
    vo/        ChatId, AgentId, ChatTitle (summarizing: a question cut to a title)
    exception/ ChatNotFoundException, ChatOfAnotherAgentException
    chat.entity.ts       Chat: start, continueWith, retitle, isOwnedBy
    chat.repository.ts   ChatRepository (the port): findById, findOwnedBy(owner, { agentId, first })
  infrastructure/
    persistence/   ChatEntitySchema, MikroOrmChatRepository
    chats-infrastructure.module.ts   ChatsInfrastructureModule, chatEntities
  filters/chat-exception.filter.ts   NOT_FOUND and CONFLICT
```

**What a chat says is not here.** The messages are the agent's checkpoints, in its AgentCore Memory,
and `apps/chat-api` reads them from there — the agent is the only one writing a conversation, so there
is no second copy to keep in step. This library keeps what a list of conversations needs and nothing
an agent decides.

- **`continueWith` is how a chat is recorded on every run.** The agent records the thread before each
  run with the first question as a title; a chat that exists keeps the title it has (a person may have
  renamed it), moves to the top (`updatedAt`), and refuses another agent — a thread is one agent's.
- **The owner is a reference** (`Ref<User>`), and deleting the user deletes their chats
  (`on delete cascade`).

The table is the migrator's (`Migration20261002160000_chats`); `apps/chat-api` is the application.
