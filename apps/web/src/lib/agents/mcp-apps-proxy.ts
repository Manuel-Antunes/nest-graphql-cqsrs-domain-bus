import {
  type AbstractAgent,
  type BaseEvent,
  EventType,
  Middleware,
  type RunAgentInput,
} from '@ag-ui/client';
import { Observable } from 'rxjs';

import {
  McpAppConnection,
  type McpAppServerConfig,
} from './mcp-app-connection';

interface ProxiedMcpRequest {
  readonly serverId?: string;
  readonly serverHash?: string;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export class McpAppServer {
  static readonly AGENTCORE_HEADER =
    'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App';

  static config(
    app: string,
    serverUrl: string,
    accessToken: string,
  ): McpAppServerConfig {
    const url = new URL(serverUrl);
    url.searchParams.set('app', app);
    url.searchParams.set('appTarget', 'mcp');
    return {
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
  static readonly FAILED = 'MCP request failed';

  constructor(
    private readonly servers: () => Promise<readonly McpAppServerConfig[]>,
  ) {
    super();
  }

  static proxiedOf(input: RunAgentInput): ProxiedMcpRequest | undefined {
    return input.forwardedProps?.__proxiedMCPRequest as
      | ProxiedMcpRequest
      | undefined;
  }

  run(input: RunAgentInput, next: AbstractAgent): Observable<BaseEvent> {
    const request = McpAppsProxy.proxiedOf(input);
    if (!request) return this.runNext(input, next);
    const { runId } = input;
    return new Observable<BaseEvent>((subscriber) => {
      subscriber.next({ type: EventType.RUN_STARTED, runId, threadId: runId });
      void this.answer(request).then((result) => {
        subscriber.next({
          type: EventType.RUN_FINISHED,
          runId,
          threadId: runId,
          result,
        });
        subscriber.complete();
      });
    });
  }

  private async answer(request: ProxiedMcpRequest): Promise<unknown> {
    const named = request.serverId || request.serverHash;
    const server = (await this.servers()).find(
      (candidate) => candidate.serverId === named,
    );
    if (!server) return { error: `Unknown server: ${named}` };
    try {
      return await McpAppConnection.send(
        server,
        request.method,
        request.params,
      );
    } catch (error) {
      console.error(
        `${McpAppsProxy.FAILED}: ${request.method} on ${server.serverId}`,
        error,
      );
      return { error: McpAppsProxy.FAILED };
    }
  }
}
