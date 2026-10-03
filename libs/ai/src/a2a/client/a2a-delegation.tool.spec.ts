import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { type BaseEvent, EventType } from '@ag-ui/core';
import { MemorySaver } from '@langchain/langgraph';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createAgent } from 'langchain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AgUiEvents } from '../../ag-ui/langchain/ag-ui-events';
import type {
  AgentContext,
  AgentRequest,
} from '../../agents/context/agent-context';
import { AgentCoreA2aServer } from '../agentcore/agentcore-a2a.server';
import { ReactAgentExecutor } from '../langchain/react-agent.executor';
import {
  ScriptedModel,
  type ScriptedTurn,
} from '../langchain/testing/scripted-model';
import { A2aModule } from '../server/a2a.module';
import { A2aAgent } from '../server/a2a-agent.decorator';
import type { A2aModuleOptions } from '../server/a2a-module.options';
import { A2aDelegation, A2aDelegationTool } from './a2a-delegation.tool';
import { RemoteA2aAgents } from './remote-a2a-agents';

const TOKEN = 'the-callers-token';
const THREAD = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

const caller: AgentContext = {
  isAuthenticated: true,
  userName: 'user-1',
  tenant: '',
  actorId: 'user-1',
  credential: TOKEN,
};

const turns: ScriptedTurn[] = [
  { text: ['The post ', 'is published.'] },
  { text: ['Are you sure you want to delete it?'] },
];

@A2aAgent({
  id: 'posts',
  name: 'Posts Manager',
  description: 'Manages the posts.',
  skills: [
    { id: 'publish', name: 'Publish posts', description: 'Writes a post.' },
  ],
})
class PostsAgent implements A2aAgent {
  readonly taskStore = new InMemoryTaskStore();
  readonly executor = new ReactAgentExecutor(
    createAgent({
      model: new ScriptedModel(turns),
      tools: [],
      checkpointer: new MemorySaver(),
    }),
  );
}

const headersSeen: Headers[] = [];
let host: INestApplication;
let base: string;

const bearerFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${TOKEN}`);
  return fetch(input, { ...init, headers });
};

beforeAll(async () => {
  const options = {
    baseUrl: 'https://agent.test',
    agentProviders: [PostsAgent],
    allowAnonymous: false,
    context: async ({ headers }: AgentRequest) =>
      headers.authorization === `Bearer ${TOKEN}` ? caller : undefined,
    card: {
      name: 'Posts Manager',
      description: 'Manages the posts.',
      version: '1.0.0',
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      securitySchemes: {
        bearer: {
          scheme: {
            $case: 'httpAuthSecurityScheme',
            value: { description: '', scheme: 'Bearer', bearerFormat: 'JWT' },
          },
        },
      },
      securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    },
  } as unknown as A2aModuleOptions;
  const testing = await Test.createTestingModule({
    imports: [A2aModule.register(options)],
  }).compile();
  host = testing.createNestApplication(new FastifyAdapter(), {
    logger: false,
  });
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  base = `http://127.0.0.1:${port}/`;
  await new AgentCoreA2aServer(host, { agent: PostsAgent, url: base }).listen(
    port,
    '127.0.0.1',
  );
  const server = host.getHttpServer();
  server.prependListener('request', (request: IncomingMessage) => {
    headersSeen.push(new Headers(request.headers as Record<string, string>));
  });
});

afterAll(async () => {
  await host?.close();
});

const delegating = (toolCallId: string) => {
  const events: BaseEvent[] = [];
  const config = {
    toolCall: { id: toolCallId, name: A2aDelegationTool.NAME, args: {} },
    configurable: { thread_id: THREAD },
    writer: (chunk: unknown) => {
      const event = AgUiEvents.of(chunk);
      if (event) events.push(event);
    },
  };
  return { events, config };
};

describe('delegating a task to a remote A2A agent', () => {
  it('reads the roster off the agents’ cards, with the caller’s credential', async () => {
    const agents = await RemoteA2aAgents.connect([base], bearerFetch);

    expect(agents.names).toEqual(['Posts Manager']);
    expect(agents.roster()).toContain('- Publish posts: Writes a post.');
    expect(agents.find('posts manager').name).toBe('Posts Manager');
    expect(() => agents.find('Nobody')).toThrow(/Posts Manager/);
    expect(headersSeen.at(-1)?.get('authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('streams the remote answer as an AG-UI subagent of the call, and answers the model with it', async () => {
    const agents = await RemoteA2aAgents.connect([base], bearerFetch);
    const { events, config } = delegating('call-1');

    const report = await new A2aDelegation(
      agents.find('Posts Manager'),
      config,
    ).send('Publish "Hello".');

    expect(report).toBe('The post is published.');
    expect(events.map((event) => event.type)).toEqual([
      EventType.SUBAGENT_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.SUBAGENT_FINISHED,
    ]);
    expect(events[0]).toMatchObject({
      subagentRunId: 'call-1',
      name: 'Posts Manager',
      parentToolCallId: 'call-1',
    });
    expect(
      events.every(
        (event) =>
          (event as { subagentRunId?: string }).subagentRunId === 'call-1',
      ),
    ).toBe(true);
    expect(events.at(-1)).toMatchObject({ result: 'The post is published.' });
    const sent = headersSeen.at(-1);
    expect(sent?.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(sent?.get(A2aDelegation.SESSION_HEADER)).toBe(THREAD);
  });

  it('keeps the conversation: the same thread is one remote context', async () => {
    const agents = await RemoteA2aAgents.connect([base], bearerFetch);
    const tool = A2aDelegationTool.create(agents);

    const answer = await tool.invoke(
      { agentName: 'Posts Manager', task: 'Now delete it.' },
      delegating('call-2').config,
    );

    expect((answer as { content: unknown }).content).toBe(
      'Are you sure you want to delete it?',
    );
  });

  it('tells the model, and the client, when the remote agent cannot be reached', async () => {
    const agents = await RemoteA2aAgents.connect([base], bearerFetch);
    const unreachable = {
      ...agents.find('Posts Manager'),
      client: {
        sendMessageStream: async function* () {
          yield* [];
          throw new Error('connection refused');
        },
      },
    } as never;
    const { events, config } = delegating('call-3');

    const report = await new A2aDelegation(unreachable, config).send('Hi');

    expect(report).toBe(
      'Posts Manager could not be reached: connection refused',
    );
    expect(events.map((event) => event.type)).toEqual([
      EventType.SUBAGENT_STARTED,
      EventType.SUBAGENT_ERROR,
    ]);
  });
});
