import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  AbstractAgent,
  type BaseEvent,
  EventType,
  HttpAgent,
  type RunAgentInput,
} from '@ag-ui/client';
import type { INestApplication } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Observable } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import type { AgentContext } from '../../agents/context/agent-context';
import { AgentRunContext } from '../../agents/context/agent-run-context';
import { AgUiModule } from '../server/ag-ui.module';
import { AgUiAgent } from '../server/ag-ui-agent.decorator';
import type { AgUiModuleOptions } from '../server/ag-ui-module.options';
import { AgentCoreAgUiServer } from './agentcore-ag-ui.server';

const TOKEN = 'a-verified-token';

const caller: AgentContext = {
  isAuthenticated: true,
  userName: 'user-1',
  tenant: '',
  actorId: 'user-1',
  credential: TOKEN,
};

const seen: (string | undefined)[] = [];
let release: (() => void) | undefined;

class EchoAgent extends AbstractAgent {
  run(input: RunAgentInput): Observable<BaseEvent> {
    seen.push(AgentRunContext.current()?.userName);
    return new Observable<BaseEvent>((subscriber) => {
      void (async () => {
        const { threadId, runId } = input;
        subscriber.next({ type: EventType.RUN_STARTED, threadId, runId });
        if (release === undefined) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        const said = input.messages.at(-1)?.content;
        subscriber.next({
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'reply',
          role: 'assistant',
        });
        subscriber.next({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'reply',
          delta: `echo: ${said}`,
        });
        subscriber.next({
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'reply',
        });
        subscriber.next({ type: EventType.RUN_FINISHED, threadId, runId });
        subscriber.complete();
      })();
    });
  }
}

let builds = 0;

@AgUiAgent({ id: 'echo', description: 'Says back what it heard.' })
class EchoProvider implements AgUiAgent {
  readonly agent = () => {
    builds += 1;
    return new EchoAgent();
  };
}

let host: INestApplication | undefined;

afterEach(async () => {
  await host?.close();
  host = undefined;
  seen.length = 0;
  release = undefined;
  builds = 0;
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
    agentProviders: [EchoProvider],
    context: async ({ headers }) =>
      headers.authorization === `Bearer ${TOKEN}` ? caller : undefined,
  } satisfies AgUiModuleOptions;
  const testing = await Test.createTestingModule({
    imports: [AgUiModule.register(options)],
  }).compile();
  host = testing.createNestApplication(new FastifyAdapter(), {
    logger: false,
  });
  const port = await freePort();
  await new AgentCoreAgUiServer(host).listen(port, '127.0.0.1');
  return `http://127.0.0.1:${port}`;
}

const clientOf = (base: string, token?: string) =>
  new HttpAgent({
    url: `${base}/invocations`,
    threadId: 'thread-1',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    initialMessages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  });

describe('an AG-UI agent hosted on the AgentCore Runtime contract', () => {
  it('runs the agent as the caller the credential names, streaming AG-UI events the client accepts', async () => {
    const base = await listening();
    release = () => undefined;
    const client = clientOf(base, TOKEN);

    const { newMessages } = await client.runAgent();

    expect(newMessages).toEqual([
      expect.objectContaining({ role: 'assistant', content: 'echo: hello' }),
    ]);
    expect(seen).toEqual(['user-1']);
  });

  it('builds a lazily declared agent once, on its first run', async () => {
    const base = await listening();
    release = () => undefined;

    await clientOf(base, TOKEN).runAgent();
    await clientOf(base, TOKEN).runAgent();

    expect(builds).toBe(1);
  });

  it('answers the runtime health check, busy while a run is in flight', async () => {
    const base = await listening();
    const run = clientOf(base, TOKEN).runAgent();

    await expect.poll(() => seen.length).toBe(1);
    await expect.poll(() => typeof release).toBe('function');
    const busy = await (await fetch(`${base}/ping`)).json();
    release?.();
    await run;
    const idle = await (await fetch(`${base}/ping`)).json();

    expect(busy).toEqual({ status: 'HealthyBusy' });
    expect(idle).toEqual({ status: 'Healthy' });
  });

  it('refuses an invocation without a credential with an AG-UI RUN_ERROR, before the agent runs', async () => {
    const base = await listening();

    const response = await fetch(`${base}/invocations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ threadId: 't', runId: 'r', messages: [] }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(await response.text()).toContain('"code":"UNAUTHORIZED"');
    expect(seen).toEqual([]);
  });

  it('refuses a body that is not a RunAgentInput', async () => {
    const base = await listening();

    const response = await fetch(`${base}/invocations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ hello: 'world' }),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('"code":"VALIDATION_ERROR"');
    expect(seen).toEqual([]);
  });

  it('refuses a credential the resolver does not recognise', async () => {
    const base = await listening();

    await expect(clientOf(base, 'forged').runAgent()).rejects.toThrow();
    expect(seen).toEqual([]);
  });
});
