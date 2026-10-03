import 'server-only';

import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';

import { env } from '@/env.mjs';
import { WebAuth } from '@/lib/auth/server';

import { McpAppServer, McpAppsProxy } from './mcp-apps-proxy';

export class PostsMcpApp {
  static readonly APP = 'posts';

  static readonly SCOPES = ['read:posts', 'write:posts'] as const;

  static proxyFor(identity: Identity): McpAppsProxy {
    return new McpAppsProxy(async () => [
      McpAppServer.config(
        PostsMcpApp.APP,
        env.POSTS_MCP_URL,
        await WebAuth.delegatedToken(identity, {
          audiences: [env.POSTS_MCP_RESOURCE],
          scopes: PostsMcpApp.SCOPES,
        }),
      ),
    ]);
  }
}
