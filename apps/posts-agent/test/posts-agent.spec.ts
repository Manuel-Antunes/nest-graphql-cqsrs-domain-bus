import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type AgentCard, Role } from '@a2a-js/sdk';
import {
  ClientFactory,
  ClientFactoryOptions,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client';
import { ChatBedrockConverse } from '@langchain/aws';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { tool } from '@langchain/core/tools';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AgentCoreA2aServer } from '@nestposts/ai/a2a/agentcore/agentcore-a2a.server';
import { ScriptedModel } from '@nestposts/ai/a2a/langchain/testing/scripted-model';
import { AgentCallers } from '@nestposts/ai/agents/callers/agent-callers';
import { PlatformCaller } from '@nestposts/ai/agents/callers/platform-caller';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext, MikroORM } from '@nestposts/database';
import { migrateSystem } from '@nestposts/migrator/main';
import { z } from 'zod';

import { PostsMcpTools } from '../src/mcp/posts-mcp-tools';

const ISSUER = 'https://issuer.test';
const AGENT = 'https://issuer.test/a2a/posts';
const GATEWAY = 'https://issuer.test/graphql';

const freePort = async (): Promise<number> => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
};

const textOf = (value: unknown): string => JSON.stringify(value);

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

describe('the posts agent, as AgentCore Runtime runs it', () => {
  let app: INestApplicationContext;
  let base: string;
  const model = new RecordingModel([
    {
      toolCalls: [
        {
          id: 'call-1',
          name: 'read_file',
          args: { file_path: '/skills/browse-posts/SKILL.md' },
        },
      ],
    },
    { toolCalls: [{ id: 'call-2', name: 'WhoAmI', args: {} }] },
    { text: ['You are ', 'Ana.'] },
  ]);
  const callersSeen: (PlatformCaller | undefined)[] = [];

  const auth = () => app.get<BetterAuth>(BETTER_AUTH);
  const inContext = <T>(work: () => Promise<T>) =>
    inRequestContext(app.get(MikroORM), work);

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
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    Object.assign(process.env, {
      AUTH_ISSUER: ISSUER,
      AUTH_OAUTH_RESOURCES: AGENT,
      POSTS_AGENT_RESOURCE: AGENT,
      POSTS_AGENT_PORT: String(port),
      POSTS_AGENT_HOST: '127.0.0.1',
      POSTS_AGENT_URL: `${base}/`,
    });
    await migrateSystem();
    const { AppModule } = await import('../src/app.module');

    let callers: AgentCallers | undefined;
    const whoAmI = tool(
      async () => {
        callersSeen.push(callers?.currentAs(PlatformCaller));
        return JSON.stringify({ data: { me: { name: 'Ana' } } });
      },
      {
        name: 'WhoAmI',
        description: 'Who the caller is.',
        schema: z.object({}),
      },
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ChatBedrockConverse)
      .useValue(model)
      .overrideProvider(PostsMcpTools)
      .useValue({ load: async () => [whoAmI] })
      .compile();
    app = await moduleRef.init();
    callers = app.get(AgentCallers);
    await app.get(AgentCoreA2aServer).listen();
  });

  afterAll(async () => {
    await app?.close();
  });

  const clientAs = (token: string) =>
    new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [
          new JsonRpcTransportFactory({
            fetchImpl: (input, init) => {
              const headers = new Headers(init?.headers);
              headers.set('authorization', `Bearer ${token}`);
              return fetch(input, { ...init, headers });
            },
          }),
        ],
      }),
    ).createFromUrl(`${base}/`);

  const ask = (text: string) => ({
    tenant: '',
    message: {
      messageId: `m-${text.length}`,
      contextId: 'context-1',
      taskId: '',
      role: Role.ROLE_USER,
      parts: [
        {
          content: { $case: 'text' as const, value: text },
          metadata: undefined,
          filename: '',
          mediaType: 'text/plain',
        },
      ],
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
    },
    configuration: undefined,
    metadata: undefined,
  });

  it('publishes a card with its skills, and how to get a credential from the platform', async () => {
    const card = (await (
      await fetch(`${base}/.well-known/agent-card.json`, {
        headers: { 'A2A-Version': '1.0' },
      })
    ).json()) as AgentCard;

    expect(card.name).toBe('Posts Manager');
    expect(card.skills.map((skill) => skill.id)).toEqual([
      'browse-posts',
      'publish-posts',
      'curate-posts',
    ]);
    expect(textOf(card.skills)).not.toContain('pageInfo.endCursor');
    expect(textOf(card.securitySchemes)).toContain(
      `${ISSUER}/api/auth/oauth2/authorize`,
    );
    expect(textOf(card.securitySchemes)).toContain(
      `${ISSUER}/.well-known/oauth-authorization-server`,
    );
    expect(card.supportedInterfaces.map((i) => i.url)).toEqual([
      `${base}/`,
      `${base}/`,
    ]);
  });

  it('answers as the platform identity the token names, reading a skill and calling the tools with that token', async () => {
    const user = await givenAUser(`ana-${Date.now()}@example.com`);
    const token = await tokenFor({
      sub: user.id,
      aud: [AGENT, 'https://issuer.test/mcp'],
      scope: 'openid read:posts write:posts',
    });
    const client = await clientAs(token);

    const answer = await client.sendMessage(ask('Who am I?'));

    expect(textOf(answer)).toContain('You are Ana.');
    expect(callersSeen).toHaveLength(1);
    expect(callersSeen[0]?.accessToken).toBe(token);
    expect(callersSeen[0]?.userName).toBe(user.id);
    expect(callersSeen[0]?.identity.kind).toBe('user');
    expect(callersSeen[0]?.identity.scopes).toEqual([
      'openid',
      'read:posts',
      'write:posts',
    ]);
    expect(textOf(model.prompts[0])).toContain('/skills/browse-posts/SKILL.md');
    expect(textOf(model.prompts[1])).toContain('pageInfo.endCursor');
  });

  it('refuses a token issued for another resource before any model or tool runs', async () => {
    const user = await givenAUser(`bia-${Date.now()}@example.com`);
    const token = await tokenFor({ sub: user.id, aud: GATEWAY });
    const client = await clientAs(token);
    const before = model.prompts.length;

    await expect(client.sendMessage(ask('Who am I?'))).rejects.toThrow();
    expect(model.prompts).toHaveLength(before);
  });

  it('refuses a token for a user the platform does not know', async () => {
    const token = await tokenFor({ sub: 'nobody', aud: AGENT });
    const client = await clientAs(token);
    const before = model.prompts.length;

    await expect(client.sendMessage(ask('Who am I?'))).rejects.toThrow();
    expect(model.prompts).toHaveLength(before);
  });
});
