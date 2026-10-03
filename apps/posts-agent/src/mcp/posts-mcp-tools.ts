import type { StructuredToolInterface } from '@langchain/core/tools';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { McpClientPool } from '@nestposts/ai/mcp/mcp-client-pool';

import type { McpConfig } from '../config/mcp.config';
import { mcpConfig } from '../config/mcp.config';
import { CallerBearerAuthProvider } from './caller-bearer.auth-provider';

@Injectable()
export class PostsMcpTools implements OnModuleDestroy {
  static readonly SERVER = 'posts';
  static readonly APP_ONLY = new Set(['execute']);

  private readonly pool: McpClientPool;

  constructor(@Inject(mcpConfig.KEY) config: McpConfig) {
    this.pool = new McpClientPool({
      label: 'PostsMcp',
      serverKey: PostsMcpTools.SERVER,
      connectTimeoutMs: config.connectTimeoutMs,
      attempts: config.attempts,
      retryDelayMs: config.retryDelayMs,
      build: (_key, onError) =>
        new MultiServerMCPClient({
          mcpServers: {
            [PostsMcpTools.SERVER]: {
              transport: 'http',
              url: config.url,
              authProvider: new CallerBearerAuthProvider(),
              automaticSSEFallback: false,
            },
          },
          useStandardContentBlocks: true,
          onConnectionError: ({ error }) => onError(error),
        }),
    });
  }

  async load(): Promise<StructuredToolInterface[]> {
    return (await this.pool.getTools()).filter(
      (candidate) => !PostsMcpTools.APP_ONLY.has(candidate.name),
    );
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.onModuleDestroy();
  }
}
