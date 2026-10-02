import { randomUUID } from 'node:crypto';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import {
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AgentMemories } from '@nestposts/ai/checkpoint/agent-memories';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import {
  inRequestContext,
  MikroORM,
  TENANT_MIGRATIONS,
} from '@nestposts/database';
import { AgentCoreMemorySaver } from '@nestposts/langgraph-checkpoint-aws';
import { FakeAgentCoreMemory } from '@nestposts/langgraph-checkpoint-aws/testing/fake-agentcore-memory';
import { migrate } from '@nestposts/migrator/main';
import { tenantMigrations } from '@nestposts/migrator/migrations/tenant/index';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { AgentTranscripts } from '../src/infrastructure/transcripts/agent-transcripts';

interface Caller {
  readonly cookie: string;
  readonly userId: string;
}

interface Answer {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

const MEMORY = 'theo-memory';

describe('the chat subgraph', () => {
  const memory = new FakeAgentCoreMemory();
  let app: NestFastifyApplication;
  let url: string;

  const theoKept = async (
    actorId: string,
    threadId: string,
    turns: [question: string, answer: string][],
  ) => {
    const saver = new AgentCoreMemorySaver(MEMORY, {
      client: memory,
      checkpointFormat: AgentMemories.FORMAT,
    });
    const scripted = [...turns];
    const graph = new StateGraph(MessagesAnnotation)
      .addNode('answer', ({ messages }) => {
        const said = messages.at(-1)?.text;
        if (said === 'search') {
          return {
            messages: [
              new AIMessage({
                id: randomUUID(),
                content: '',
                tool_calls: [
                  {
                    id: 'call-1',
                    name: 'search_the_web',
                    args: { query: 'q' },
                  },
                ],
              }),
              new ToolMessage({
                id: randomUUID(),
                content: '[1] A result',
                tool_call_id: 'call-1',
              }),
              new AIMessage({ id: randomUUID(), content: 'Found it.' }),
            ],
          };
        }
        return {
          messages: [
            new AIMessage({
              id: randomUUID(),
              content: scripted.shift()?.[1] ?? '',
            }),
          ],
        };
      })
      .addEdge(START, 'answer')
      .addEdge('answer', END)
      .compile({ checkpointer: saver });
    for (const [question] of [...turns]) {
      await graph.invoke(
        {
          messages: [new HumanMessage({ id: randomUUID(), content: question })],
        },
        { configurable: { thread_id: threadId, actor_id: actorId } },
      );
    }
  };

  const execute = async (
    query: string,
    variables: Record<string, unknown> = {},
    caller?: Caller,
    tenant?: string,
  ): Promise<Answer> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(caller ? { cookie: caller.cookie } : {}),
        ...(tenant ? { 'x-tenant': tenant } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as Answer;
  };

  const signedUp = async (name: string): Promise<Caller> => {
    const email = `${name.toLowerCase()}-${UserId.generate().value}@example.com`;
    const auth = app.get<BetterAuth>(BETTER_AUTH);
    const { headers, response } = await inRequestContext(
      app.get(MikroORM),
      () =>
        auth.api.signUpEmail({
          body: { email, name, password: 'senha-super-secreta' },
          returnHeaders: true,
        }),
    );
    const cookie = headers
      .getSetCookie()
      .map((entry: string) => entry.split(';')[0])
      .join('; ');
    return { cookie, userId: response.user.id };
  };

  const RECORD = `mutation Record($input: RecordChatInput!) {
    recordChat(input: $input) { id agentId title }
  }`;

  beforeAll(async () => {
    await migrate();
    const module = await Test.createTestingModule({
      imports: [(await import('../src/app.module')).AppModule],
    })
      .overrideProvider(TENANT_MIGRATIONS)
      .useValue({ migrationsList: tenantMigrations })
      .overrideProvider(AgentTranscripts)
      .useValue(
        new AgentTranscripts(
          new Map([
            [
              'theo',
              new AgentCoreMemorySaver(MEMORY, {
                client: memory,
                checkpointFormat: AgentMemories.FORMAT,
              }),
            ],
          ]),
        ),
      )
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    await app.listen(0, '127.0.0.1');
    url = `${(await app.getUrl()).replace('[::1]', '127.0.0.1')}/graphql`;
  });

  afterAll(() => app?.close());

  it('refuses a caller with no session', async () => {
    const answer = await execute('{ chats { id } }');

    expect(answer.errors?.[0].extensions).toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('keeps the chat an agent records, titled by the first thing asked, and lists them the one that moved last first', async () => {
    const ana = await signedUp('Ana');
    const first = randomUUID();
    const second = randomUUID();

    await execute(
      RECORD,
      { input: { id: first, agentId: 'theo', title: 'Write about tuna' } },
      ana,
    );
    await execute(
      RECORD,
      { input: { id: second, agentId: 'theo', title: 'Something else' } },
      ana,
    );
    const again = await execute(
      RECORD,
      { input: { id: first, agentId: 'theo', title: 'A follow-up' } },
      ana,
    );
    const listed = await execute(
      'query Chats { chats(agentId: "theo") { id title } }',
      {},
      ana,
    );

    expect(again.data?.recordChat).toEqual({
      id: first,
      agentId: 'theo',
      title: 'Write about tuna',
    });
    expect(listed.data?.chats).toEqual([
      { id: first, title: 'Write about tuna' },
      { id: second, title: 'Something else' },
    ]);
  });

  it('serves the conversation as the agent kept it in AgentCore Memory, for the person in the tenant', async () => {
    const ana = await signedUp('Ana');
    const chatId = randomUUID();
    await execute(RECORD, { input: { id: chatId, agentId: 'theo' } }, ana);
    await theoKept(`root:${ana.userId}`, chatId, [
      ['Hello', 'Hi Ana.'],
      ['search', ''],
    ]);

    const answer = await execute(
      `query Chat($id: ID!) {
        chat(id: $id) {
          id
          messages { role content toolCalls { id name arguments } toolCallId }
        }
      }`,
      { id: chatId },
      ana,
    );

    expect(answer.data?.chat).toEqual({
      id: chatId,
      messages: [
        { role: 'USER', content: 'Hello', toolCalls: [], toolCallId: null },
        {
          role: 'ASSISTANT',
          content: 'Hi Ana.',
          toolCalls: [],
          toolCallId: null,
        },
        { role: 'USER', content: 'search', toolCalls: [], toolCallId: null },
        {
          role: 'ASSISTANT',
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              name: 'search_the_web',
              arguments: '{"query":"q"}',
            },
          ],
          toolCallId: null,
        },
        {
          role: 'TOOL',
          content: '[1] A result',
          toolCalls: [],
          toolCallId: 'call-1',
        },
        {
          role: 'ASSISTANT',
          content: 'Found it.',
          toolCalls: [],
          toolCallId: null,
        },
      ],
    });
  });

  it("gives nobody else a person's chat, through the root fields, the mutation or the user", async () => {
    const ana = await signedUp('Ana');
    const bia = await signedUp('Bia');
    const chatId = randomUUID();
    await execute(
      RECORD,
      { input: { id: chatId, agentId: 'theo', title: 'Mine' } },
      ana,
    );

    const read = await execute(
      'query Chat($id: ID!) { chat(id: $id) { id } }',
      { id: chatId },
      bia,
    );
    const taken = await execute(
      RECORD,
      { input: { id: chatId, agentId: 'theo', title: 'Hers now' } },
      bia,
    );
    const listed = await execute('query Chats { chats { id } }', {}, bia);
    const throughUser = await execute(
      `query Entities($representations: [_Any!]!) {
        _entities(representations: $representations) { ... on IUser { chats { id } } }
      }`,
      { representations: [{ __typename: 'IUser', id: ana.userId }] },
      bia,
    );

    expect(read.data?.chat).toBeNull();
    expect(taken.errors?.[0].extensions?.code).toBe('NOT_FOUND');
    expect(listed.data?.chats).toEqual([]);
    expect(throughUser.data?._entities).toEqual([{ chats: [] }]);
  });

  it('renames a chat, and deletes it with what the agent kept of it', async () => {
    const ana = await signedUp('Ana');
    const chatId = randomUUID();
    await execute(RECORD, { input: { id: chatId, agentId: 'theo' } }, ana);
    await theoKept(`root:${ana.userId}`, chatId, [['Hello', 'Hi.']]);

    const renamed = await execute(
      `mutation Rename($input: RenameChatInput!) { renameChat(input: $input) { title } }`,
      { input: { id: chatId, title: 'Greetings' } },
      ana,
    );
    const deleted = await execute(
      'mutation Delete($id: ID!) { deleteChat(id: $id) }',
      { id: chatId },
      ana,
    );
    const read = await execute(
      'query Chat($id: ID!) { chat(id: $id) { id } }',
      { id: chatId },
      ana,
    );

    expect(renamed.data?.renameChat).toEqual({ title: 'Greetings' });
    expect(deleted.data?.deleteChat).toBe(chatId);
    expect(read.data?.chat).toBeNull();
    expect(memory.eventsOf(`root:${ana.userId}`, chatId)).toEqual([]);
  });
});
