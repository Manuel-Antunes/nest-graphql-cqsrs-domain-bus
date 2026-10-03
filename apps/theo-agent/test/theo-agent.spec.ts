import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type BaseEvent, EventType, HttpAgent } from '@ag-ui/client';
import { ChatBedrockConverse } from '@langchain/aws';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { tool } from '@langchain/core/tools';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AgentCoreA2aServer } from '@nestposts/ai/a2a/agentcore/agentcore-a2a.server';
import { ScriptedModel } from '@nestposts/ai/a2a/langchain/testing/scripted-model';
import { A2aMiddlewareAgent } from '@nestposts/ai/ag-ui/a2a/a2a-middleware.agent';
import { AgentCoreAgUiServer } from '@nestposts/ai/ag-ui/agentcore/agentcore-ag-ui.server';
import type { AgentContext } from '@nestposts/ai/agents/context/agent-context';
import { AgentRunContext } from '@nestposts/ai/agents/context/agent-run-context';
import { WebSearchTool } from '@nestposts/ai/web/web-search.tool';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext, MikroORM } from '@nestposts/database';
import { migrateSystem } from '@nestposts/migrator/main';
import { PostsManagerAgent } from '@nestposts/posts-agent/agent/posts-manager.agent';
import { PostsMcpTools } from '@nestposts/posts-agent/mcp/posts-mcp-tools';
import {
  type SearchOptions,
  WebSearchClient,
  type WebSearchResponse,
} from 'bedrock-agentcore/web-search';
import { z } from 'zod';

import { TheoAgent } from '../src/agent/theo.agent';

const ISSUER = 'https://issuer.test';
const THEO = 'https://issuer.test/agui/theo';
const POSTS_AGENT = 'https://issuer.test/a2a/posts';
const MCP = 'https://issuer.test/mcp';

const freePort = async (): Promise<number> => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
};

class RecordingModel extends ScriptedModel {
  readonly prompts: BaseMessage[][] = [];

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    this.prompts.push(messages);
    yield* super._streamResponseChunks(messages, options, runManager);
  }
}

describe('Theo, an AG-UI agent on AgentCore Runtime that hands posts to the posts agent over A2A', () => {
  let postsAgent: INestApplication;
  let theo: INestApplication;
  let theoBase: string;
  const theoModel = new RecordingModel([
    {
      toolCalls: [
        {
          id: 'call-1',
          name: A2aMiddlewareAgent.DELEGATION_TOOL,
          args: { agentName: 'Posts Manager', task: 'Tell me who I am.' },
        },
      ],
    },
    { text: ['You are ', 'Ana.'] },
    {
      toolCalls: [
        {
          id: 'search-1',
          name: WebSearchTool.NAME,
          args: { query: 'AgentCore news' },
        },
      ],
    },
    { text: ['The new AgentCore Runtime is out.'] },
  ]);
  const webSearch = {
    search: vi.fn<
      (query: string, options?: SearchOptions) => Promise<WebSearchResponse>
    >(async () => ({
      results: [
        {
          text: 'The new AgentCore Runtime is generally available.',
          url: 'https://aws.amazon.com/new-agentcore-runtime/',
          title: 'New AgentCore Runtime',
        },
      ],
    })),
  };
  const postsModel = new RecordingModel([
    { toolCalls: [{ id: 'posts-call-1', name: 'WhoAmI', args: {} }] },
    { text: ['The caller is ', 'Ana.'] },
  ]);
  const callersSeen: (AgentContext | undefined)[] = [];
  const recorded: {
    authorization?: string;
    tenant?: string;
    input: Record<string, unknown>;
  }[] = [];
  let chatApi: Server;

  const auth = () => theo.get<BetterAuth>(BETTER_AUTH);
  const inContext = <T>(work: () => Promise<T>) =>
    inRequestContext(theo.get(MikroORM), work);

  const tokenFor = async (payload: Record<string, unknown>) =>
    (await inContext(() => auth().api.signJWT({ body: { payload } }))).token;

  const givenAUser = (email: string) =>
    inContext(async () =>
      (await auth().$context).internalAdapter.createUser(
        { email, name: 'Ana', emailVerified: true },
        { method: 'admin' },
      ),
    );

  beforeAll(async () => {
    const [postsPort, theoPort] = [await freePort(), await freePort()];
    chatApi = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        recorded.push({
          authorization: request.headers.authorization,
          tenant: request.headers['x-tenant'] as string | undefined,
          input: JSON.parse(body).variables.input,
        });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ data: { recordChat: { id: 'x' } } }));
      });
    });
    await new Promise<void>((resolve) =>
      chatApi.listen(0, '127.0.0.1', resolve),
    );
    const postsBase = `http://127.0.0.1:${postsPort}`;
    theoBase = `http://127.0.0.1:${theoPort}`;
    Object.assign(process.env, {
      AUTH_ISSUER: ISSUER,
      AUTH_OAUTH_RESOURCES: `${THEO},${POSTS_AGENT}`,
      POSTS_AGENT_RESOURCE: POSTS_AGENT,
      POSTS_AGENT_PORT: String(postsPort),
      POSTS_AGENT_HOST: '127.0.0.1',
      POSTS_AGENT_URL: `${postsBase}/`,
      THEO_AGENT_PORT: String(theoPort),
      THEO_AGENT_HOST: '127.0.0.1',
      THEO_A2A_AGENTS: `${postsBase}/`,
      CHAT_API_URL: `http://127.0.0.1:${(chatApi.address() as AddressInfo).port}/graphql`,
    });
    await migrateSystem();

    const { AppModule: PostsAgentModule } = await import(
      '@nestposts/posts-agent/app.module'
    );
    const whoAmI = tool(
      async () => {
        callersSeen.push(AgentRunContext.current());
        return JSON.stringify({ data: { me: { name: 'Ana' } } });
      },
      {
        name: 'WhoAmI',
        description: 'Who the caller is.',
        schema: z.object({}),
      },
    );
    postsAgent = (
      await Test.createTestingModule({ imports: [PostsAgentModule] })
        .overrideProvider(ChatBedrockConverse)
        .useValue(postsModel)
        .overrideProvider(PostsMcpTools)
        .useValue({ load: async () => [whoAmI] })
        .compile()
    ).createNestApplication(new FastifyAdapter(), { logger: false });
    await new AgentCoreA2aServer(postsAgent, {
      agent: PostsManagerAgent,
      url: `${postsBase}/`,
    }).listen(postsPort, '127.0.0.1');

    const { AppModule: TheoModule } = await import('../src/app.module');
    theo = (
      await Test.createTestingModule({ imports: [TheoModule] })
        .overrideProvider(ChatBedrockConverse)
        .useValue(theoModel)
        .overrideProvider(WebSearchClient)
        .useValue(webSearch)
        .compile()
    ).createNestApplication(new FastifyAdapter(), { logger: false });
    await new AgentCoreAgUiServer(theo, { agent: TheoAgent }).listen(
      theoPort,
      '127.0.0.1',
    );
  });

  afterAll(async () => {
    await theo?.close();
    await postsAgent?.close();
    await new Promise<void>((resolve) => chatApi?.close(() => resolve()));
  });

  const clientAs = (token: string, text: string) =>
    new HttpAgent({
      url: `${theoBase}/invocations`,
      threadId: randomUUID(),
      headers: { Authorization: `Bearer ${token}` },
      initialMessages: [{ id: randomUUID(), role: 'user', content: text }],
    });

  it('answers through the posts agent, which acts as the same person with the same token', async () => {
    const user = await givenAUser(`ana-${Date.now()}@example.com`);
    const token = await tokenFor({
      sub: user.id,
      aud: [THEO, POSTS_AGENT, MCP],
      scope: 'openid read:posts write:posts',
    });
    const client = clientAs(token, 'Who am I?');
    const events: BaseEvent[] = [];

    const { newMessages } = await client.runAgent(
      {},
      { onEvent: ({ event }) => void events.push(event) },
    );

    const flow = events.filter(
      (event) =>
        event.type !== EventType.STEP_STARTED &&
        event.type !== EventType.STEP_FINISHED,
    );
    expect(flow.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_END,
      EventType.SUBAGENT_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.SUBAGENT_FINISHED,
      EventType.TOOL_CALL_RESULT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.MESSAGES_SNAPSHOT,
      EventType.RUN_FINISHED,
    ]);
    expect(flow[3]).toMatchObject({
      subagentRunId: 'call-1',
      name: 'Posts Manager',
      parentToolCallId: 'call-1',
    });
    expect(flow[9]).toMatchObject({
      toolCallId: 'call-1',
      content: 'The caller is Ana.',
    });
    expect(
      newMessages.map((message) => [
        message.role,
        message.subagentRunId,
        message.role === 'tool' || message.role === 'assistant'
          ? message.content
          : undefined,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['assistant', undefined, ''],
        ['assistant', 'call-1', 'The caller is Ana.'],
        ['tool', undefined, 'The caller is Ana.'],
        ['assistant', undefined, 'You are Ana.'],
      ]),
    );
    expect(newMessages).toHaveLength(4);
    expect(callersSeen).toHaveLength(1);
    expect(callersSeen[0]?.credential).toBe(token);
    expect(callersSeen[0]?.userName).toBe(user.id);
    expect(JSON.stringify(theoModel.prompts[0][0])).toContain(
      '### Posts Manager',
    );
    expect(JSON.stringify(postsModel.prompts[0])).toContain(
      'Tell me who I am.',
    );
    expect(recorded.at(-1)).toEqual({
      authorization: `Bearer ${token}`,
      tenant: 'root',
      input: { id: client.threadId, agentId: 'theo', title: 'Who am I?' },
    });
  });

  it('searches the web for something recent, and answers from what it found', async () => {
    const user = await givenAUser(`caio-${Date.now()}@example.com`);
    const token = await tokenFor({
      sub: user.id,
      aud: [THEO, POSTS_AGENT, MCP],
      scope: 'openid read:posts write:posts',
    });
    const events: BaseEvent[] = [];
    const asked = theoModel.prompts.length;

    await clientAs(token, 'What is new in AgentCore?').runAgent(
      {},
      { onEvent: ({ event }) => void events.push(event) },
    );

    expect(webSearch.search).toHaveBeenCalledWith('AgentCore news', {
      maxResults: WebSearchTool.MAX_RESULTS,
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: EventType.TOOL_CALL_START,
          toolCallId: 'search-1',
          toolCallName: WebSearchTool.NAME,
        }),
        expect.objectContaining({
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: 'search-1',
          content: expect.stringContaining(
            'https://aws.amazon.com/new-agentcore-runtime/',
          ),
        }),
      ]),
    );
    expect(JSON.stringify(theoModel.prompts[asked][0])).toContain(
      '## Searching the web',
    );
    expect(JSON.stringify(theoModel.prompts[asked + 1])).toContain(
      'The new AgentCore Runtime is generally available.',
    );
  });

  it('refuses a token issued for another resource, before any model runs', async () => {
    const user = await givenAUser(`bia-${Date.now()}@example.com`);
    const token = await tokenFor({ sub: user.id, aud: [MCP] });
    const before = theoModel.prompts.length;

    await expect(clientAs(token, 'Who am I?').runAgent()).rejects.toThrow(
      /401/,
    );
    expect(theoModel.prompts).toHaveLength(before);
  });

  it('refuses a token for a user the platform does not know', async () => {
    const token = await tokenFor({ sub: 'nobody', aud: [THEO, POSTS_AGENT] });
    const before = theoModel.prompts.length;

    await expect(clientAs(token, 'Who am I?').runAgent()).rejects.toThrow(
      /401/,
    );
    expect(theoModel.prompts).toHaveLength(before);
  });
});
