import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import {
  type AbstractAgent,
  type BaseEvent,
  EventType,
  type RunAgentInput,
} from '@ag-ui/client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { lastValueFrom, of, toArray } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { McpAppServer, McpAppsProxy } from './mcp-apps-proxy';

const RESOURCE = 'ui://widget/posts#abc';
const DROPS_THE_STREAM = 'DropsTheStream';
const seen: {
  query: string;
  authorization?: string;
  app?: string;
  socket: Socket;
}[] = [];
let server: Server;
let url: string;

function mcpServer(): McpServer {
  const mcp = new McpServer({ name: 'posts', version: '1.0.0' });
  mcp.registerResource('posts', RESOURCE, { mimeType: 'text/html' }, () => ({
    contents: [
      { uri: RESOURCE, mimeType: 'text/html', text: '<p>the app</p>' },
    ],
  }));
  mcp.registerTool(
    'SavePost',
    { inputSchema: { id: z.string(), title: z.string() } },
    ({ id, title }) => ({
      content: [],
      structuredContent: { result: { data: { updatePost: { id, title } } } },
    }),
  );
  return mcp;
}

const bodyOf = async (request: IncomingMessage): Promise<unknown> => {
  if (request.method !== 'POST') return undefined;
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
};

const dropsTheStream = (body: unknown): boolean =>
  (body as { method?: string; params?: { name?: string } } | undefined)?.params
    ?.name === DROPS_THE_STREAM;

beforeAll(async () => {
  server = createServer(async (request, response) => {
    seen.push({
      query: new URL(request.url ?? '/', 'http://localhost').search,
      authorization: request.headers.authorization,
      app: request.headers[McpAppServer.AGENTCORE_HEADER.toLowerCase()] as
        | string
        | undefined,
      socket: request.socket,
    });
    const body = await bodyOf(request);
    if (dropsTheStream(body)) {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      setTimeout(() => request.socket.destroy(), 10);
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await mcpServer().connect(transport);
    await transport.handleRequest(request, response, body);
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const theo = {
  run: () =>
    of<BaseEvent[]>(
      { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' } as BaseEvent,
      { type: EventType.RUN_FINISHED, threadId: 't', runId: 'r' } as BaseEvent,
    ),
} as unknown as AbstractAgent;

const input = (
  forwardedProps: Record<string, unknown> = {},
): RunAgentInput => ({
  threadId: 't',
  runId: 'r',
  messages: [],
  tools: [],
  context: [],
  state: {},
  forwardedProps,
});

const proxy = () =>
  new McpAppsProxy(async () => [
    McpAppServer.config('posts', url, 'the-persons-token'),
  ]);

const resultOf = async (
  forwardedProps: Record<string, unknown>,
): Promise<unknown> => {
  const events = await lastValueFrom(
    proxy().run(input(forwardedProps), theo).pipe(toArray()),
  );
  const finished = events.find(
    (event) => event.type === EventType.RUN_FINISHED,
  ) as { result?: unknown } | undefined;
  return finished?.result;
};

describe('McpAppsProxy', () => {
  it('leaves an ordinary run to Theo, without reaching any MCP server', async () => {
    const before = seen.length;
    const events = await lastValueFrom(
      proxy().run(input(), theo).pipe(toArray()),
    );

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.RUN_FINISHED,
    ]);
    expect(seen).toHaveLength(before);
  });

  it('reads the app for the iframe from the server, as the person, in app mode', async () => {
    const result = (await resultOf({
      __proxiedMCPRequest: {
        serverHash: 'posts',
        serverId: 'posts',
        method: 'resources/read',
        params: { uri: RESOURCE },
      },
    })) as { contents: { text: string }[] };

    expect(result.contents[0]?.text).toBe('<p>the app</p>');
    const last = seen.at(-1);
    expect(last?.query).toBe('?app=posts&appTarget=mcp');
    expect(last?.authorization).toBe('Bearer the-persons-token');
    expect(last?.app).toBe('posts');
  });

  it('calls the tool the app asked for and hands back its result', async () => {
    const result = await resultOf({
      __proxiedMCPRequest: {
        serverHash: 'posts',
        serverId: 'posts',
        method: 'tools/call',
        params: { name: 'SavePost', arguments: { id: 'p1', title: 'New' } },
      },
    });

    expect(result).toMatchObject({
      structuredContent: {
        result: { data: { updatePost: { id: 'p1', title: 'New' } } },
      },
    });
  });

  it('answers the app at once with a failure when the stream that would carry the answer drops, instead of leaving it waiting', async () => {
    const started = Date.now();

    const result = await resultOf({
      __proxiedMCPRequest: {
        serverHash: 'posts',
        serverId: 'posts',
        method: 'tools/call',
        params: { name: DROPS_THE_STREAM, arguments: {} },
      },
    });

    expect(result).toEqual({ error: McpAppsProxy.FAILED });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('sends every request of an app on a connection of its own, never on one an earlier request left open', async () => {
    const before = seen.length;

    await resultOf({
      __proxiedMCPRequest: {
        serverHash: 'posts',
        serverId: 'posts',
        method: 'resources/read',
        params: { uri: RESOURCE },
      },
    });
    await resultOf({
      __proxiedMCPRequest: {
        serverHash: 'posts',
        serverId: 'posts',
        method: 'tools/call',
        params: { name: 'SavePost', arguments: { id: 'p1', title: 'New' } },
      },
    });

    const sockets = seen.slice(before).map((request) => request.socket);
    expect(sockets.length).toBeGreaterThan(2);
    expect(new Set(sockets).size).toBe(sockets.length);
  });

  it('refuses a server the app does not know', async () => {
    expect(
      await resultOf({
        __proxiedMCPRequest: {
          serverHash: 'elsewhere',
          serverId: 'elsewhere',
          method: 'tools/call',
          params: { name: 'SavePost', arguments: {} },
        },
      }),
    ).toEqual({ error: 'Unknown server: elsewhere' });
  });
});
