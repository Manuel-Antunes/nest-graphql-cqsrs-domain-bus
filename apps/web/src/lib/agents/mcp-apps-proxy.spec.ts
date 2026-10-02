import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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
const seen: { query: string; authorization?: string; app?: string }[] = [];
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

beforeAll(async () => {
  server = createServer(async (request, response) => {
    seen.push({
      query: new URL(request.url ?? '/', 'http://localhost').search,
      authorization: request.headers.authorization,
      app: request.headers[McpAppServer.AGENTCORE_HEADER.toLowerCase()] as
        | string
        | undefined,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await mcpServer().connect(transport);
    await transport.handleRequest(request, response);
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
