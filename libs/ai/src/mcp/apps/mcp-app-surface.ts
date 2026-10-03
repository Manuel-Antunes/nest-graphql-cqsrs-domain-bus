import { A2uiExtension } from '../../a2a/domain/extensions/a2ui.extension';

export interface McpToolResult {
  readonly content?: readonly unknown[];
  readonly structuredContent?: unknown;
  readonly _meta?: Record<string, unknown>;
  readonly isError?: boolean;
}

export interface McpAppPlacement {
  readonly surfaceId: string;
  readonly catalogId: string;
  readonly server: string;
  readonly resourceUri: string;
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly toolResult: McpToolResult;
  readonly title?: string;
}

export type A2uiMessage =
  | {
      version: typeof McpAppSurface.VERSION;
      createSurface: { surfaceId: string; catalogId: string };
    }
  | {
      version: typeof McpAppSurface.VERSION;
      updateComponents: {
        surfaceId: string;
        components: Record<string, unknown>[];
      };
    };

export class McpAppSurface {
  static readonly VERSION = 'v0.9';
  static readonly ROOT = 'root';

  static messages(placement: McpAppPlacement): A2uiMessage[] {
    const { surfaceId, catalogId } = placement;
    return [
      {
        version: McpAppSurface.VERSION,
        createSurface: { surfaceId, catalogId },
      },
      {
        version: McpAppSurface.VERSION,
        updateComponents: {
          surfaceId,
          components: [
            {
              id: McpAppSurface.ROOT,
              component: A2uiExtension.MCP_APP_COMPONENT,
              server: placement.server,
              resourceUri: placement.resourceUri,
              toolName: placement.toolName,
              toolInput: placement.toolInput,
              toolResult: McpAppSurface.resultOf(placement.toolResult),
              ...(placement.title ? { title: placement.title } : {}),
            },
          ],
        },
      },
    ];
  }

  static surfaceIdFor(toolName: string, callId: string): string {
    return `mcp-app-${toolName}-${callId}`.replace(/[^A-Za-z0-9_-]/g, '-');
  }

  private static resultOf(result: McpToolResult): McpToolResult {
    return {
      content: result.content ?? [],
      ...(result.structuredContent === undefined
        ? {}
        : { structuredContent: result.structuredContent }),
      ...(result._meta ? { _meta: result._meta } : {}),
      ...(result.isError ? { isError: true } : {}),
    };
  }
}
