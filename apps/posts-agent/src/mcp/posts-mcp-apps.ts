import type { StructuredToolInterface } from '@langchain/core/tools';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { AgentCallers } from '@nestposts/ai/agents/callers/agent-callers';
import { McpAppEndpoint } from '@nestposts/ai/mcp/apps/mcp-app-endpoint';
import {
  type McpAppToolDefinition,
  McpAppTools,
} from '@nestposts/ai/mcp/apps/mcp-app-tools';
import { McpClientPool } from '@nestposts/ai/mcp/mcp-client-pool';

import type { McpConfig } from '../config/mcp.config';
import { mcpConfig } from '../config/mcp.config';
import { CallerBearerAuthProvider } from './caller-bearer.auth-provider';

@Injectable()
export class PostsMcpApps implements OnModuleDestroy {
  static readonly SERVER = 'posts';
  static readonly APP = 'posts';

  private readonly logger = new Logger(PostsMcpApps.name);
  private readonly pool: McpClientPool;
  private definitions: McpAppToolDefinition[] = [];

  constructor(@Inject(mcpConfig.KEY) config: McpConfig, callers: AgentCallers) {
    const endpoint = McpAppEndpoint.of(config.url, PostsMcpApps.APP);
    this.pool = new McpClientPool({
      label: 'PostsMcpApps',
      serverKey: PostsMcpApps.SERVER,
      connectTimeoutMs: config.connectTimeoutMs,
      attempts: config.attempts,
      retryDelayMs: config.retryDelayMs,
      build: (_key, onError) =>
        new MultiServerMCPClient({
          mcpServers: {
            [PostsMcpApps.SERVER]: {
              transport: 'http',
              url: endpoint.url,
              headers: { ...endpoint.headers },
              authProvider: new CallerBearerAuthProvider(callers),
              automaticSSEFallback: false,
            },
          },
          useStandardContentBlocks: true,
          onConnectionError: ({ error }) => onError(error),
        }),
      afterConnect: async (client) => {
        const raw = await client.getClient(PostsMcpApps.SERVER);
        if (!raw) return;
        this.definitions = McpAppTools.definitionsOf(
          (await raw.listTools()).tools,
        );
      },
    });
  }

  async load(): Promise<StructuredToolInterface[]> {
    const tools = await this.pool.getTools();
    const openers = McpAppTools.openers(
      PostsMcpApps.SERVER,
      tools,
      this.definitions,
    );
    if (openers.length === 0) {
      this.logger.warn(
        `The ${PostsMcpApps.APP} MCP App offers no tool that opens it (${tools.length} tools listed in app mode): the agent answers in prose alone.`,
      );
    }
    return openers;
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.onModuleDestroy();
  }
}
