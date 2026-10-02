import type { StructuredToolInterface } from '@langchain/core/tools';
import type { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { McpClientPool } from './mcp-client-pool';

/**
 * Pins the session-recovery behaviour of {@link McpClientPool}: a streamable-HTTP
 * MCP server can drop OUR session, and the failure surfaces as a TOOL error
 * ("Session not found") — NOT an `onConnectionError`. The pool must therefore
 * reconnect + retry the call ONCE on a fresh session, instead of serving the
 * dead-session tools for the container's life.
 */
describe('McpClientPool — tool-call session recovery', () => {
  /** A fake MCP client exposing one tool whose `invoke` is driven per attempt. */
  function fakeClientFactory(
    invokeByAttempt: (attempt: number, input: unknown) => Promise<unknown>,
  ) {
    let attempt = 0;
    const calls = { build: 0, close: 0 };
    const build = (): MultiServerMCPClient => {
      calls.build += 1;
      const myAttempt = ++attempt;
      const tool = {
        name: 'DoThing',
        invoke: (input: unknown) => invokeByAttempt(myAttempt, input),
      } as unknown as StructuredToolInterface;
      return {
        getTools: async () => [tool],
        close: async () => {
          calls.close += 1;
        },
      } as unknown as MultiServerMCPClient;
    };
    return { build: () => build(), calls };
  }

  it('reconnects + retries once when a tool call hits "Session not found"', async () => {
    const { build, calls } = fakeClientFactory(async (attempt, input) => {
      if (attempt === 1) {
        throw new Error(
          'Streamable HTTP error: Error POSTing to endpoint: Not Found: Session not found',
        );
      }
      return `ok:${String(input)}`;
    });
    const pool = new McpClientPool({ label: 'test', serverKey: 'k', build });

    const [tool] = await pool.getTools();
    const result = await tool.invoke('hi' as never);

    expect(result).toBe('ok:hi');
    expect(calls.build).toBe(2); // initial connect + one reconnect
  });

  it('passes a successful call straight through (no reconnect)', async () => {
    const { build, calls } = fakeClientFactory(
      async (_a, input) => `ok:${String(input)}`,
    );
    const pool = new McpClientPool({ label: 'test', serverKey: 'k', build });

    const [tool] = await pool.getTools();
    expect(await tool.invoke('x' as never)).toBe('ok:x');
    expect(calls.build).toBe(1);
  });

  it('propagates a NON-session error without reconnecting', async () => {
    const { build, calls } = fakeClientFactory(async () => {
      throw new Error('validation failed: bad argument');
    });
    const pool = new McpClientPool({ label: 'test', serverKey: 'k', build });

    const [tool] = await pool.getTools();
    await expect(tool.invoke('x' as never)).rejects.toThrow(
      'validation failed',
    );
    expect(calls.build).toBe(1); // no reconnect for a non-session error
  });

  it('gives up after ONE retry when the session stays broken', async () => {
    const { build, calls } = fakeClientFactory(async () => {
      throw new Error('Session not found');
    });
    const pool = new McpClientPool({ label: 'test', serverKey: 'k', build });

    const [tool] = await pool.getTools();
    await expect(tool.invoke('x' as never)).rejects.toThrow(
      'Session not found',
    );
    expect(calls.build).toBe(2); // initial + exactly one reconnect, then it throws
  });
});

/**
 * Pins the connect ceiling. The gateway's Lambda bootstrap resolves these tools
 * (`A2aRegistry.onModuleInit` resolves the A2A skill providers, which construct
 * agents that inject them), so without a ceiling a borrow inherits the MCP SDK's
 * own ~60s request timeout and the app cannot listen until it elapses — which is
 * what pushed the gateway's cold boot past `awaitBooted`'s 20s ceiling and made
 * every deploy's health check answer 503.
 */
describe('McpClientPool — connect timeout', () => {
  const hangingClient = () =>
    ({
      getTools: () => new Promise<never>(() => undefined), // never settles
      close: async () => undefined,
    }) as unknown as MultiServerMCPClient;

  it('gives up on a hanging connect and degrades to no tools', async () => {
    const pool = new McpClientPool({
      label: 'Test',
      serverKey: 'chat',
      build: hangingClient,
      connectTimeoutMs: 50,
    });

    const started = Date.now();
    await expect(pool.getTools('t1')).resolves.toEqual([]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('retries on the next borrow rather than caching the failure', async () => {
    let hang = true;
    const tool = {
      name: 'DoThing',
      invoke: async () => 'ok',
    } as unknown as StructuredToolInterface;
    const pool = new McpClientPool({
      label: 'Test',
      serverKey: 'chat',
      connectTimeoutMs: 50,
      build: () =>
        (hang
          ? {
              getTools: () => new Promise<never>(() => undefined),
              close: async () => undefined,
            }
          : {
              getTools: async () => [tool],
              close: async () => undefined,
            }) as unknown as MultiServerMCPClient,
    });

    expect(await pool.getTools('t1')).toEqual([]);
    hang = false;
    const recovered = await pool.getTools('t1');
    expect(recovered.map((t) => t.name)).toEqual(['DoThing']);
  });

  it('does not time out a connect that resolves in time', async () => {
    const tool = {
      name: 'Fast',
      invoke: async () => 'ok',
    } as unknown as StructuredToolInterface;
    const pool = new McpClientPool({
      label: 'Test',
      serverKey: 'chat',
      connectTimeoutMs: 5000,
      build: () =>
        ({
          getTools: async () => [tool],
          close: async () => undefined,
        }) as unknown as MultiServerMCPClient,
    });
    expect((await pool.getTools()).map((t) => t.name)).toEqual(['Fast']);
  });
});

describe('McpClientPool — a session AgentCore is still provisioning', () => {
  const PROVISIONING =
    'Error calling tool CreatePost: McpError: MCP error -32005: Session operation in progress, please retry';
  const HEALTH_CHECK =
    'Error calling tool CreatePost: Error: Streamable HTTP error: Error POSTing to endpoint: {"message":"Runtime health check failed or timed out"}';

  afterEach(() => vi.restoreAllMocks());

  function poolCalling(outcomes: readonly (string | Error)[]) {
    const invocations: unknown[] = [];
    let builds = 0;
    const tool = {
      name: 'CreatePost',
      invoke: async (input: unknown) => {
        invocations.push(input);
        const outcome = outcomes[invocations.length - 1] ?? outcomes.at(-1);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    } as unknown as StructuredToolInterface;
    const pool = new McpClientPool({
      label: 'PostsMcp',
      serverKey: 'posts',
      retryDelayMs: 1,
      build: () => {
        builds += 1;
        return {
          getTools: async () => [tool],
          close: async () => undefined,
        } as unknown as MultiServerMCPClient;
      },
    });
    return { pool, invocations, builds: () => builds };
  }

  it('calls the same tool again, on the same session, until the session is up', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const { pool, invocations, builds } = poolCalling([
      new Error(HEALTH_CHECK),
      new Error(PROVISIONING),
      'published',
    ]);

    const [tool] = await pool.getTools();

    expect(await tool.invoke('Alien X' as never)).toBe('published');
    expect(invocations).toEqual(['Alien X', 'Alien X', 'Alien X']);
    expect(builds()).toBe(1);
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      "PostsMcp MCP session still being provisioned on tool 'CreatePost' — retry 1 of 3 in 1ms",
      "PostsMcp MCP session still being provisioned on tool 'CreatePost' — retry 2 of 3 in 2ms",
    ]);
  });

  it('gives up after three retries and hands the error on', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const { pool, invocations } = poolCalling([new Error(PROVISIONING)]);

    const [tool] = await pool.getTools();

    await expect(tool.invoke('Alien X' as never)).rejects.toThrow(
      'Session operation in progress',
    );
    expect(invocations).toHaveLength(4);
  });

  it('does not call a tool again for an error the tool itself answered', async () => {
    const { pool, invocations } = poolCalling([
      new Error(
        "MCP tool 'CreatePost' on server 'posts' returned an error: not an author",
      ),
    ]);

    const [tool] = await pool.getTools();

    await expect(tool.invoke('Alien X' as never)).rejects.toThrow(
      'not an author',
    );
    expect(invocations).toHaveLength(1);
  });
});

describe('McpClientPool — a connection that lists no tool', () => {
  const tool = {
    name: 'ListPosts',
    invoke: async () => 'ok',
  } as unknown as StructuredToolInterface;

  afterEach(() => vi.restoreAllMocks());

  it('lists again within the same borrow, up to its attempts', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    let builds = 0;
    const pool = new McpClientPool({
      label: 'PostsMcp',
      serverKey: 'posts',
      attempts: 3,
      retryDelayMs: 1,
      build: (_key, onError) => {
        builds += 1;
        const refused = builds === 1;
        return {
          getTools: async () => {
            if (!refused) return [tool];
            onError(new Error('All discovery URLs failed'));
            return [];
          },
          close: async () => undefined,
        } as unknown as MultiServerMCPClient;
      },
    });

    const tools = await pool.getTools();

    expect(tools.map((t) => t.name)).toEqual(['ListPosts']);
    expect(builds).toBe(2);
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      'PostsMcp connection failed [key=default]: All discovery URLs failed',
      'PostsMcp listed no tool [key=default] on attempt 1 of 3 — retrying in 1ms',
    ]);
  });

  it('degrades to no tools once every attempt listed none', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    let builds = 0;
    const pool = new McpClientPool({
      label: 'PostsMcp',
      serverKey: 'posts',
      attempts: 2,
      retryDelayMs: 1,
      build: () => {
        builds += 1;
        return {
          getTools: async () => [],
          close: async () => undefined,
        } as unknown as MultiServerMCPClient;
      },
    });

    expect(await pool.getTools()).toEqual([]);
    expect(builds).toBe(2);
  });
});
