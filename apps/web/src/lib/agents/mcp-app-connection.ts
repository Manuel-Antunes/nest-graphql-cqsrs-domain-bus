import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface McpAppServerConfig {
  readonly serverId: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export class McpAppConnection {
  static readonly METHODS: ReadonlySet<string> = new Set([
    'tools/call',
    'resources/read',
    'notifications/message',
    'ping',
  ]);

  static readonly DROPPED_STREAM = 'SSE stream disconnected';

  private static readonly UI_EXTENSION = 'io.modelcontextprotocol/ui';
  private static readonly APP_MIME_TYPE = 'text/html;profile=mcp-app';
  private static readonly RELEASE_WITHIN_MS = 3_000;

  private readonly transport: StreamableHTTPClientTransport;
  private readonly client: Client;

  private constructor(server: McpAppServerConfig) {
    const url = new URL(server.url);
    this.transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: { ...server.headers, connection: 'close' },
        redirect: 'error',
      },
      fetch: McpAppConnection.pinnedTo(url.origin),
    });
    this.client = new Client(
      { name: 'nestposts-web', version: '1.0.0' },
      {
        capabilities: {
          extensions: {
            [McpAppConnection.UI_EXTENSION]: {
              mimeTypes: [McpAppConnection.APP_MIME_TYPE],
            },
          },
        },
      },
    );
  }

  static async send(
    server: McpAppServerConfig,
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    if (!McpAppConnection.METHODS.has(method)) {
      throw new Error(`MCP method not allowed for an app: ${method}`);
    }
    const connection = new McpAppConnection(server);
    try {
      return await connection.answer(method, params);
    } finally {
      await connection.release();
    }
  }

  static pinnedTo(origin: string): typeof fetch {
    return (target, init) => {
      const url = new URL(
        target instanceof Request ? target.url : String(target),
      );
      if (url.origin !== origin) {
        return Promise.reject(new Error('MCP transport changed origin'));
      }
      return fetch(target, {
        ...init,
        redirect: 'error',
        ...(init?.method === 'DELETE'
          ? { signal: AbortSignal.timeout(McpAppConnection.RELEASE_WITHIN_MS) }
          : {}),
      });
    };
  }

  private answer(
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    const dropped = new Promise<never>((_, reject) => {
      this.client.onerror = (error) => {
        if (error.message.startsWith(McpAppConnection.DROPPED_STREAM)) {
          reject(error);
        }
      };
    });
    return Promise.race([this.connectAndSend(method, params), dropped]);
  }

  private async connectAndSend(
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    await this.client.connect(this.transport);
    switch (method) {
      case 'tools/call':
        return this.client.callTool(
          params as { name: string; arguments?: Record<string, unknown> },
        );
      case 'resources/read':
        return this.client.readResource(params as { uri: string });
      case 'notifications/message':
        await this.client.notification({ method, params });
        return { success: true };
      default:
        return this.client.ping();
    }
  }

  private async release(): Promise<void> {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.transport.terminateSession().catch(() => undefined),
      new Promise<void>((resolve) => {
        deadline = setTimeout(resolve, McpAppConnection.RELEASE_WITHIN_MS);
      }),
    ]);
    clearTimeout(deadline);
    await this.client.close();
  }
}
