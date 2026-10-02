import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export type PostsAppTool = 'ChoosePostToEdit' | 'EditPost' | 'PreviewPost';

export interface PostsAppOpening {
  readonly tool: PostsAppTool;
  readonly input: Record<string, unknown>;
}

export interface OpenedPostsApp {
  readonly resourceUri: string;
  readonly toolName: PostsAppTool;
  readonly toolInput: Record<string, unknown>;
  readonly toolResult: {
    readonly content: readonly unknown[];
    readonly structuredContent?: unknown;
    readonly _meta?: Record<string, unknown>;
    readonly isError?: true;
  };
}

/**
 * **The posts MCP App, reached the way the posts agent reaches it**: the real Apollo MCP Server of
 * `apps/mcp`'s image, in app mode (`?app=posts&appTarget=mcp` and the AgentCore header that stands
 * for it), with the caller's own token. `open` lists the app's tools, finds the `ui://` resource the
 * tool names, and calls it — what the posts agent's opener does before it answers with the surface,
 * the result's text left out as it is there.
 */
export class PostsMcpApp {
  static readonly NAME = 'posts';
  static readonly RESOURCE = 'http://mcp.e2e/';
  static readonly AGENTCORE_HEADER =
    'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App';

  constructor(private readonly url: string) {}

  async open(
    { tool, input }: PostsAppOpening,
    accessToken: string,
  ): Promise<OpenedPostsApp> {
    const client = new Client({ name: 'theo-stand-in', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(this.appUrl(), {
        requestInit: {
          headers: {
            authorization: `Bearer ${accessToken}`,
            [PostsMcpApp.AGENTCORE_HEADER]: PostsMcpApp.NAME,
          },
        },
      }),
    );
    try {
      const { tools } = await client.listTools();
      const resourceUri = PostsMcpApp.resourceUriOf(
        tools.find((listed) => listed.name === tool)?._meta,
      );
      if (!resourceUri) {
        throw new Error(
          `${tool} is not a tool of the ${PostsMcpApp.NAME} app at ${this.url}`,
        );
      }
      const result = await client.callTool({ name: tool, arguments: input });
      return {
        resourceUri,
        toolName: tool,
        toolInput: input,
        toolResult: {
          content: [],
          ...(result.structuredContent === undefined
            ? {}
            : { structuredContent: result.structuredContent }),
          ...(result._meta ? { _meta: result._meta } : {}),
          ...(result.isError ? { isError: true as const } : {}),
        },
      };
    } finally {
      await client.close();
    }
  }

  private appUrl(): URL {
    const url = new URL(this.url);
    url.searchParams.set('app', PostsMcpApp.NAME);
    url.searchParams.set('appTarget', 'mcp');
    return url;
  }

  private static resourceUriOf(
    meta: Record<string, unknown> | undefined,
  ): string | undefined {
    const ui = meta?.ui as { resourceUri?: unknown } | undefined;
    const uri = ui?.resourceUri ?? meta?.['ui/resourceUri'];
    return typeof uri === 'string' ? uri : undefined;
  }
}
