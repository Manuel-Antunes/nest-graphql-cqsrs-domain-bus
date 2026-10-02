import {
  type AbstractAgent,
  type BaseEvent,
  Middleware,
  type RunAgentInput,
} from '@ag-ui/client';
import {
  MCPAppsMiddleware,
  type MCPClientConfig,
} from '@ag-ui/mcp-apps-middleware';
import { from, type Observable, switchMap } from 'rxjs';

export class McpAppServer {
  static readonly AGENTCORE_HEADER =
    'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App';

  static config(
    app: string,
    serverUrl: string,
    accessToken: string,
  ): MCPClientConfig {
    const url = new URL(serverUrl);
    url.searchParams.set('app', app);
    url.searchParams.set('appTarget', 'mcp');
    return {
      type: 'http',
      serverId: app,
      url: url.toString(),
      headers: {
        authorization: `Bearer ${accessToken}`,
        [McpAppServer.AGENTCORE_HEADER]: app,
      },
    };
  }
}

export class McpAppsProxy extends Middleware {
  constructor(
    private readonly servers: () => Promise<readonly MCPClientConfig[]>,
  ) {
    super();
  }

  static isProxied(input: RunAgentInput): boolean {
    return input.forwardedProps?.__proxiedMCPRequest !== undefined;
  }

  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    if (!McpAppsProxy.isProxied(input)) return this.runNext(input, next);
    return from(this.servers()).pipe(
      switchMap((mcpServers) =>
        new MCPAppsMiddleware({ mcpServers: [...mcpServers] }).run(input, next),
      ),
    );
  }
}
