import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type AgentCard, Role } from '@a2a-js/sdk';
import {
  ClientFactory,
  ClientFactoryOptions,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client';
import {
  AgentEvent,
  type AgentExecutor,
  InMemoryTaskStore,
  type RequestContext,
  type User,
} from '@a2a-js/sdk/server';
import type { ModuleRef } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentCallers } from '../../agents/callers/agent-callers';
import { A2aRegistry } from '../server/a2a.registry';
import { A2aAgent } from '../server/a2a-agent.decorator';
import { A2aAgentResolver } from '../server/a2a-agent.resolver';
import type { A2aModuleOptions } from '../server/a2a-module.options';
import type { AgentCoreA2aOptions } from './agentcore-a2a.options';
import { AgentCoreA2aServer } from './agentcore-a2a.server';

const TOKEN = 'a-verified-token';

class BearerUser implements User {
  constructor(readonly userName: string) {}

  get isAuthenticated(): boolean {
    return true;
  }
}

class EchoExecutor implements AgentExecutor {
  readonly callers: (string | undefined)[] = [];

  async execute(
    context: RequestContext,
    bus: Parameters<AgentExecutor['execute']>[1],
  ): Promise<void> {
    this.callers.push(context.context?.user?.userName);
    bus.publish(
      AgentEvent.message({
        messageId: 'reply',
        contextId: context.contextId,
        taskId: '',
        role: Role.ROLE_AGENT,
        parts: [
          {
            content: { $case: 'text', value: 'pong' },
            metadata: undefined,
            filename: '',
            mediaType: 'text/plain',
          },
        ],
        metadata: undefined,
        extensions: [],
        referenceTaskIds: [],
      }),
    );
    bus.finished();
  }

  async cancelTask(): Promise<void> {}
}

const executor = new EchoExecutor();

@A2aAgent({
  id: 'echo',
  skills: [{ id: 'echo', name: 'Echo', description: 'Answers pong.' }],
})
class EchoAgent implements A2aAgent {
  readonly executor = executor;
  readonly taskStore = new InMemoryTaskStore();
}

const SECURITY = {
  securitySchemes: {
    bearer: {
      scheme: {
        $case: 'httpAuthSecurityScheme',
        value: { description: '', scheme: 'Bearer', bearerFormat: 'JWT' },
      },
    },
  },
  securityRequirements: [{ schemes: { bearer: { list: [] } } }],
};

let agentCore: AgentCoreA2aServer | undefined;

afterEach(async () => {
  await agentCore?.onApplicationShutdown();
  agentCore = undefined;
  executor.callers.length = 0;
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function listening(): Promise<string> {
  const options = {
    baseUrl: 'https://agent.test',
    agentProviders: [EchoAgent],
    resolveUser: async (headers: Record<string, unknown>) =>
      headers.authorization === `Bearer ${TOKEN}`
        ? new BearerUser('user-1')
        : undefined,
    card: {
      name: 'Echo',
      description: 'An agent under test.',
      version: '1.0.0',
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      ...SECURITY,
    },
  } as unknown as A2aModuleOptions;
  const moduleRef = {
    get: (Provider: new () => unknown) => new Provider(),
    resolve: async (Provider: new () => unknown) => new Provider(),
  } as unknown as ModuleRef;
  const callers = new AgentCallers();
  const registry = new A2aRegistry(options, moduleRef, callers);
  await registry.onModuleInit();

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  agentCore = new AgentCoreA2aServer(
    new A2aAgentResolver(registry),
    callers,
    options,
    {
      port,
      host: '127.0.0.1',
      agent: EchoAgent,
      url: `${base}/`,
    } satisfies AgentCoreA2aOptions,
  );
  await agentCore.listen();
  return base;
}

const clientFor = (base: string, token?: string) =>
  new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [
        new JsonRpcTransportFactory({
          fetchImpl: (input, init) =>
            fetch(input, {
              ...init,
              headers: {
                ...Object.fromEntries(new Headers(init?.headers)),
                ...(token ? { authorization: `Bearer ${token}` } : {}),
              },
            }),
        }),
      ],
    }),
  ).createFromUrl(base);

const ping = {
  message: {
    messageId: 'm-1',
    contextId: 'c-1',
    taskId: '',
    role: Role.ROLE_USER,
    parts: [
      {
        content: { $case: 'text' as const, value: 'ping' },
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
  tenant: '',
};

describe('an agent hosted on the AgentCore Runtime contract', () => {
  it('publishes the registry card at the well-known path, JSON-RPC at the runtime URL in both protocol versions', async () => {
    const base = await listening();

    const response = await fetch(`${base}/.well-known/agent-card.json`, {
      headers: { 'A2A-Version': '1.0' },
    });
    const card = (await response.json()) as AgentCard;

    expect(response.status).toBe(200);
    expect(card.name).toBe('Echo');
    expect(
      card.supportedInterfaces.map(
        (iface) =>
          `${iface.protocolBinding} ${iface.protocolVersion} ${iface.url}`,
      ),
    ).toEqual([`JSONRPC 1.0 ${base}/`, `JSONRPC 0.3 ${base}/`]);
    expect(card.capabilities?.extensions?.length).toBeGreaterThan(0);
  });

  it('answers the runtime health check', async () => {
    const base = await listening();

    const response = await fetch(`${base}/ping`);

    expect(await response.json()).toEqual({ status: 'Healthy' });
  });

  it('refuses an invocation without a credential before the executor runs', async () => {
    const base = await listening();

    const response = await fetch(`${base}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'A2A-Version': '1.0' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'SendMessage',
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(executor.callers).toEqual([]);
  });

  it('runs the turn as the caller the credential names', async () => {
    const base = await listening();
    const client = await clientFor(base, TOKEN);

    const result = await client.sendMessage(ping);

    expect(JSON.stringify(result)).toContain('pong');
    expect(executor.callers).toEqual(['user-1']);
  });

  it('refuses a credential the resolver does not recognise', async () => {
    const base = await listening();
    const client = await clientFor(base, 'forged');

    await expect(client.sendMessage(ping)).rejects.toThrow();
    expect(executor.callers).toEqual([]);
  });
});
