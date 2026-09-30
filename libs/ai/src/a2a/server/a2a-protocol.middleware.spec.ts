import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { type A2aRegistry, UnknownAgentReferenceError } from './a2a.registry';
import type { A2aModuleOptions } from './a2a-module.options';
import { A2aProtocolMiddleware } from './a2a-protocol.middleware';

/**
 * Who the protocol surface will talk to.
 *
 * This is the boundary that moving from `@Controller` to middleware changed, and
 * it changed it in the dangerous direction: the surface left the pipeline that
 * held the app's global auth guard. That guard was not a second line of defence
 * — it was the ONLY one, because the controller called
 * `UserBuilder.noAuthentication()` on every route it served. So these tests
 * exist to pin the replacement, not to describe it.
 *
 * The two halves are equally load-bearing:
 *   - discovery must stay open, or no client can ever learn how to authenticate;
 *   - everything else must stay shut, or the middleware move traded a working
 *     guard for none.
 */

// ============================================================================
// Harness
// ============================================================================

/** A response that records what was written instead of writing it. */
function fakeResponse() {
  const headers: Record<string, unknown> = {};
  const chunks: string[] = [];
  let status = 0;

  const res = {
    headersSent: false,
    writeHead(code: number, given?: Record<string, unknown>) {
      status = code;
      Object.assign(headers, given ?? {});
      res.headersSent = true;
      return res;
    },
    setHeader(name: string, value: unknown) {
      headers[name] = value;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(chunk);
      return res;
    },
  };

  return {
    res: res as unknown as ServerResponse,
    get status() {
      return status;
    },
    get body() {
      const raw = chunks.join('');
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },
  };
}

function fakeRequest(
  method: string,
  url: string,
  headers: Record<string, string | string[]> = {},
  body?: unknown,
): IncomingMessage {
  const req = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body))],
  ) as unknown as IncomingMessage & { originalUrl: string };
  req.method = method;
  req.url = url;
  req.originalUrl = url;
  req.headers = headers;
  return req;
}

const CARD = {
  name: 'Test Agent',
  capabilities: { streaming: true, extensions: [] },
  securitySchemes: {},
  skills: [],
  supportedInterfaces: [{ protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
} as never;

/** Records the context every handler was invoked with. */
function fakeRegistry() {
  const seen: { user?: unknown }[] = [];
  const handler = {
    async sendMessage(_req: unknown, context: { user?: unknown }) {
      seen.push(context);
      return { task: { id: 't1' } };
    },
    async *sendMessageStream(_req: unknown, context: { user?: unknown }) {
      seen.push(context);
      yield { task: { id: 't1' } };
    },
    async getTask(_req: unknown, context: { user?: unknown }) {
      seen.push(context);
      return { id: 't1' };
    },
    async listTasks(_req: unknown, context: { user?: unknown }) {
      seen.push(context);
      return { tasks: [] };
    },
    async cancelTask(_req: unknown, context: { user?: unknown }) {
      seen.push(context);
      return { id: 't1' };
    },
  };

  const registry = {
    getAgentCard: () => CARD,
    getRequestHandler: () => handler,
  } as unknown as A2aRegistry;

  return { registry, seen };
}

function build(options: Partial<A2aModuleOptions> = {}) {
  const { registry, seen } = fakeRegistry();
  const middleware = new A2aProtocolMiddleware(registry, {
    card: CARD,
    basePath: 'a2a',
    ...options,
  } as A2aModuleOptions);
  return { middleware, seen };
}

/** Every route that is NOT discovery, i.e. everything that must refuse. */
const GUARDED_ROUTES: [string, string, unknown?][] = [
  ['POST', '/a2a/v1/jsonrpc', { jsonrpc: '2.0', id: 1, method: 'GetTask' }],
  ['POST', '/a2a/rest/v1/message::send', { message: {} }],
  ['POST', '/a2a/rest/v1/message::stream', { message: {} }],
  ['GET', '/a2a/rest/v1/tasks'],
  ['GET', '/a2a/rest/v1/tasks/t1'],
  ['POST', '/a2a/rest/v1/tasks/t1:cancel', {}],
];

// ============================================================================

describe('discovery, which must work before any credential exists', () => {
  it('serves the agent card to a caller with nothing', async () => {
    const { middleware } = build();
    const out = fakeResponse();

    await middleware.use(
      fakeRequest('GET', '/a2a/.well-known/agent-card.json'),
      out.res,
      () => {
        throw new Error('card must be handled, not passed on');
      },
    );

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ name: 'Test Agent' });
  });

  it('does not even ask who is calling', async () => {
    // Not a detail: `resolveUser` reaches better-auth, and making discovery
    // depend on the session store would make an agent undiscoverable whenever
    // auth is degraded — for a route whose answer is identical either way.
    const resolveUser = vi.fn();
    const { middleware } = build({ resolveUser });

    await middleware.use(
      fakeRequest('GET', '/a2a/.well-known/agent-card.json'),
      fakeResponse().res,
      () => undefined,
    );

    expect(resolveUser).not.toHaveBeenCalled();
  });
});

describe('everything else, which must refuse an unidentified caller', () => {
  it.each(GUARDED_ROUTES)(
    'refuses %s %s when the app supplies no way to identify anyone',
    async (method, path, body) => {
      const { middleware, seen } = build();
      const out = fakeResponse();

      await middleware.use(fakeRequest(method, path, {}, body), out.res, () => {
        throw new Error(`${path} fell through to the app`);
      });

      expect(out.status).toBe(401);
      // The refusal must happen BEFORE the agent runs, not after.
      expect(seen).toHaveLength(0);
    },
  );

  it.each(GUARDED_ROUTES)(
    'refuses %s %s when the credential does not resolve',
    async (method, path, body) => {
      const { middleware, seen } = build({
        resolveUser: async () => undefined,
      });
      const out = fakeResponse();

      await middleware.use(
        fakeRequest(method, path, { authorization: 'Bearer nope' }, body),
        out.res,
        () => undefined,
      );

      expect(out.status).toBe(401);
      expect(seen).toHaveLength(0);
    },
  );

  it('points the refused caller at the card, which is how it recovers', async () => {
    const { middleware } = build();
    const out = fakeResponse();

    await middleware.use(
      fakeRequest('GET', '/a2a/rest/v1/tasks/t1'),
      out.res,
      () => undefined,
    );

    expect(out.body.error).toContain('securitySchemes');
  });
});

describe('a caller the app did identify', () => {
  it('reaches the agent, carrying the subject id', async () => {
    const { middleware, seen } = build({
      resolveUser: async () => ({ isAuthenticated: true, userName: 'user-42' }),
    });

    await middleware.use(
      fakeRequest(
        'POST',
        '/a2a/rest/v1/message::send',
        { authorization: 'Bearer good' },
        { message: {} },
      ),
      fakeResponse().res,
      () => undefined,
    );

    // `userName` is the subject id, not a display name: it scopes the task
    // store's namespace and reaches the graph as `user_id`.
    expect(seen).toHaveLength(1);
    expect(seen[0].user).toMatchObject({
      isAuthenticated: true,
      userName: 'user-42',
    });
  });

  it('is resolved from the raw headers the app can actually read', async () => {
    const resolveUser = vi
      .fn()
      .mockResolvedValue({ isAuthenticated: true, userName: 'u' });
    const { middleware } = build({ resolveUser });

    await middleware.use(
      fakeRequest('GET', '/a2a/rest/v1/tasks/t1', {
        authorization: 'Bearer good',
        cookie: 'session=abc',
      }),
      fakeResponse().res,
      () => undefined,
    );

    // Both credentials survive the hop: the browser session AND the bearer the
    // extension presents. Dropping either silently halves who can call.
    expect(resolveUser).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization: 'Bearer good',
        cookie: 'session=abc',
      }),
    );
  });
});

describe('an agent that really is open', () => {
  it('serves anonymous callers only when that is typed out', async () => {
    const { middleware, seen } = build({ allowAnonymous: true });
    const out = fakeResponse();

    await middleware.use(
      fakeRequest('POST', '/a2a/rest/v1/message::send', {}, { message: {} }),
      out.res,
      () => undefined,
    );

    expect(out.status).toBe(200);
    expect(seen[0].user).toMatchObject({ isAuthenticated: false });
  });
});

describe('routes that are not ours', () => {
  it('hands the request back to the app untouched', async () => {
    const { middleware } = build();
    const next = vi.fn();
    const out = fakeResponse();

    await middleware.use(fakeRequest('GET', '/graphql'), out.res, next);

    // A 401 here would break every non-A2A route the moment the mount path
    // widened.
    expect(next).toHaveBeenCalled();
    expect(out.status).toBe(0);
  });
});

// ============================================================================
// Which agent the call is for
// ============================================================================

/**
 * A server hosting two agents, as the middleware sees it.
 *
 * `?referenceId=` is the only thing separating them on the wire, so the risk is
 * a surface that reads it on discovery and forgets it everywhere else: a client
 * would fetch the legal agent's card and then have every message answered by the
 * root agent, with nothing in either response saying so.
 */
function fakeMultiAgentRegistry() {
  const base = CARD as unknown as Record<string, unknown>;
  const cards: Record<string, unknown> = {
    '': { ...base, name: 'Root Agent' },
    'legal-agent': { ...base, name: 'Legal Agent' },
  };
  const answered: string[] = [];

  const handlerFor = (reference: string) => ({
    async sendMessage() {
      answered.push(reference);
      return { task: { id: 't1' } };
    },
    async *sendMessageStream() {
      answered.push(reference);
      yield { task: { id: 't1' } };
    },
    async getTask() {
      answered.push(reference);
      return { id: 't1' };
    },
    async listTasks() {
      answered.push(reference);
      return { tasks: [] };
    },
    async cancelTask() {
      answered.push(reference);
      return { id: 't1' };
    },
  });

  const resolve = (reference?: string | null) => {
    const key = reference ?? '';
    if (!(key in cards)) {
      throw new UnknownAgentReferenceError(key, ['legal-agent']);
    }
    return key;
  };

  const handlers = new Map(
    Object.keys(cards).map((key) => [key, handlerFor(key)]),
  );

  const registry = {
    getAgentCard: (reference?: string | null) => cards[resolve(reference)],
    getRequestHandler: (reference?: string | null) =>
      handlers.get(resolve(reference)),
  } as unknown as A2aRegistry;

  return { registry, answered };
}

function buildMultiAgent() {
  const { registry, answered } = fakeMultiAgentRegistry();
  const middleware = new A2aProtocolMiddleware(registry, {
    card: CARD,
    basePath: 'a2a',
    allowAnonymous: true,
  } as A2aModuleOptions);
  return { middleware, answered };
}

describe('a server hosting more than one agent', () => {
  it('serves the card the reference asks for', async () => {
    const { middleware } = buildMultiAgent();
    const out = fakeResponse();

    await middleware.use(
      fakeRequest(
        'GET',
        '/a2a/.well-known/agent-card.json?referenceId=legal-agent',
      ),
      out.res,
      () => undefined,
    );

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ name: 'Legal Agent' });
  });

  it('serves the root card when nothing is asked for', async () => {
    const { middleware } = buildMultiAgent();
    const out = fakeResponse();

    await middleware.use(
      fakeRequest('GET', '/a2a/.well-known/agent-card.json'),
      out.res,
      () => undefined,
    );

    expect(out.body).toMatchObject({ name: 'Root Agent' });
  });

  it('carries the reference through the protocol routes too', async () => {
    // The half that is easy to forget: a card that describes one agent while
    // every message reaches another is worse than no second agent at all.
    const { middleware, answered } = buildMultiAgent();

    await middleware.use(
      fakeRequest(
        'POST',
        '/a2a/rest/v1/message::send?referenceId=legal-agent',
        {},
        { message: {} },
      ),
      fakeResponse().res,
      () => undefined,
    );
    await middleware.use(
      fakeRequest('GET', '/a2a/rest/v1/tasks/t1?referenceId=legal-agent'),
      fakeResponse().res,
      () => undefined,
    );
    await middleware.use(
      fakeRequest('POST', '/a2a/rest/v1/message::send', {}, { message: {} }),
      fakeResponse().res,
      () => undefined,
    );

    expect(answered).toEqual(['legal-agent', 'legal-agent', '']);
  });

  it('answers 404 for an agent it does not host', async () => {
    // Well-formed request, absent agent. Falling back to the root card here is
    // how a client ends up talking to the wrong agent and never finding out.
    const { middleware } = buildMultiAgent();
    const out = fakeResponse();

    await middleware.use(
      fakeRequest('GET', '/a2a/.well-known/agent-card.json?referenceId=nope'),
      out.res,
      () => undefined,
    );

    expect(out.status).toBe(404);
    expect(out.body.error).toContain('legal-agent');
  });
});
