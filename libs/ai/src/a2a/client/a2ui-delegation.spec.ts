import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { InMemoryTaskStore } from '@a2a-js/sdk/server';
import { MemorySaver } from '@langchain/langgraph';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createAgent, tool } from 'langchain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type {
  AgentContext,
  AgentRequest,
} from '../../agents/context/agent-context';
import { McpAppTools } from '../../mcp/apps/mcp-app-tools';
import { AgentCoreA2aServer } from '../agentcore/agentcore-a2a.server';
import { A2uiExtension } from '../domain/extensions/a2ui.extension';
import { A2aMiddleware } from '../langchain/a2a.middleware';
import { ReactAgentExecutor } from '../langchain/react-agent.executor';
import { ScriptedModel } from '../langchain/testing/scripted-model';
import { A2aModule } from '../server/a2a.module';
import { A2aAgent } from '../server/a2a-agent.decorator';
import type { A2aModuleOptions } from '../server/a2a-module.options';
import { A2aDelegation } from './a2a-delegation';
import { A2uiCapabilities } from './a2ui-capabilities';
import { RemoteA2aAgents } from './remote-a2a-agents';

const TOKEN = 'the-callers-token';
const CATALOG = 'nestposts://a2ui/catalogs/theo/v1';
const RESOURCE = 'ui://widget/posts#abc';
const STRUCTURED = { result: { data: { me: { id: 'u1' } } } };

const caller: AgentContext = {
  isAuthenticated: true,
  userName: 'user-1',
  tenant: '',
  actorId: 'user-1',
  credential: TOKEN,
};

const choosePost = McpAppTools.openers(
  'posts',
  [
    tool(
      async () => [
        JSON.stringify(STRUCTURED),
        [{ type: 'mcp_structured_content', data: STRUCTURED }],
      ],
      {
        name: 'ChoosePostToEdit',
        description: 'Shows the posts to pick one.',
        schema: z.object({}),
        responseFormat: 'content_and_artifact',
      },
    ),
  ],
  [{ name: 'ChoosePostToEdit', resourceUri: RESOURCE, opensApp: true }],
);

@A2aAgent({
  id: 'posts',
  name: 'Posts Manager',
  description: 'Manages the posts.',
  skills: [{ id: 'edit', name: 'Edit posts', description: 'Edits a post.' }],
})
class PostsAgent implements A2aAgent {
  readonly taskStore = new InMemoryTaskStore();
  readonly executor = new ReactAgentExecutor(
    createAgent({
      model: new ScriptedModel([
        { toolCalls: [{ id: 'c1', name: 'ChoosePostToEdit', args: {} }] },
        { text: ['Pick the post on screen.'] },
        { text: ['You have one post.'] },
      ]),
      tools: choosePost,
      middleware: [A2aMiddleware.create()],
      checkpointer: new MemorySaver(),
    }),
  );
}

const sent: { headers: Headers; body: Record<string, unknown> }[] = [];
let host: INestApplication;
let base: string;

const bearerFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${TOKEN}`);
  if (typeof init?.body === 'string') {
    sent.push({ headers, body: JSON.parse(init.body) });
  }
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
});

afterAll(async () => {
  await host?.close();
});

const callerRendering = (catalogs: Record<string, unknown>[]) => ({
  toolCallId: 'call-1',
  contextId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
  a2ui: A2uiCapabilities.of([
    { description: 'Something else', value: 'not json' },
    ...catalogs.map((catalog) => ({
      description: 'A2UI Component Schema',
      value: JSON.stringify(catalog),
    })),
  ]),
  emit: () => undefined,
});

describe('delegating to an agent whose answer is an MCP App', () => {
  it('names the caller’s catalog, and hands back the surface for the client to render', async () => {
    const agents = await RemoteA2aAgents.connect([base], bearerFetch);

    const report = await new A2aDelegation(
      agents.find('Posts Manager'),
      callerRendering([
        { catalogId: 'basic-only', components: { Text: {} } },
        { catalogId: CATALOG, components: { McpApp: {}, Text: {} } },
      ]),
    ).send('The person wants to edit one of their posts.');

    const { headers, body } = sent.at(-1) ?? {
      headers: new Headers(),
      body: {},
    };
    expect(headers.get('A2A-Extensions')).toBe(new A2uiExtension().uri);
    expect(
      (body.params as { message: { metadata: Record<string, unknown> } })
        .message.metadata,
    ).toEqual({
      [A2uiExtension.CLIENT_CAPABILITIES_KEY]: {
        supportedCatalogIds: [CATALOG],
      },
    });
    const parsed = JSON.parse(report) as {
      a2ui_operations: { createSurface?: { catalogId: string } }[];
      answer: string;
    };
    expect(parsed.answer).toBe('Pick the post on screen.');
    expect(parsed.a2ui_operations).toHaveLength(2);
    expect(parsed.a2ui_operations[0]?.createSurface?.catalogId).toBe(CATALOG);
  });

  it('asks for nothing it cannot draw when the caller renders no McpApp', async () => {
    const agents = await RemoteA2aAgents.connect([base], bearerFetch);

    const report = await new A2aDelegation(
      agents.find('Posts Manager'),
      callerRendering([{ catalogId: 'basic-only', components: { Text: {} } }]),
    ).send('How many posts do I have?');

    expect(report).toBe('You have one post.');
    expect(sent.at(-1)?.headers.get('A2A-Extensions')).toBeNull();
  });
});
