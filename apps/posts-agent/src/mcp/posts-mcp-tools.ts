import type { StructuredToolInterface } from '@langchain/core/tools';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { A2aCallers } from '@nestposts/ai/a2a/server/a2a-callers';
import { McpClientPool } from '@nestposts/ai/mcp/mcp-client-pool';

import type { McpConfig } from '../config/mcp.config';
import { mcpConfig } from '../config/mcp.config';
import { CallerBearerAuthProvider } from './caller-bearer.auth-provider';

@Injectable()
export class PostsMcpTools implements OnModuleDestroy {
  static readonly SERVER = 'posts';

  private readonly pool: McpClientPool;

  constructor(@Inject(mcpConfig.KEY) config: McpConfig, callers: A2aCallers) {
    this.pool = new McpClientPool({
      label: 'PostsMcp',
      serverKey: PostsMcpTools.SERVER,
      connectTimeoutMs: config.connectTimeoutMs,
      build: (_key, onError) =>
        new MultiServerMCPClient({
          mcpServers: {
            [PostsMcpTools.SERVER]: {
              transport: 'http',
              url: config.url,
              authProvider: new CallerBearerAuthProvider(callers),
              automaticSSEFallback: false,
            },
          },
          useStandardContentBlocks: true,
          onConnectionError: () => onError(),
        }),
    });
  }

  load(): Promise<StructuredToolInterface[]> {
    return this.pool.getTools();
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.onModuleDestroy();
  }
}
