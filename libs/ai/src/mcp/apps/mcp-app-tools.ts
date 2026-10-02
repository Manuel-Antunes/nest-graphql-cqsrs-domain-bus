import { randomUUID } from 'node:crypto';
import { ToolMessage } from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { tool } from 'langchain';

import type { McpAppPlacement, McpToolResult } from './mcp-app-surface';
import { McpAppSurface } from './mcp-app-surface';

export interface McpToolListing {
  readonly name: string;
  readonly annotations?: { readonly readOnlyHint?: boolean };
  readonly _meta?: Record<string, unknown>;
}

export interface McpAppToolDefinition {
  readonly name: string;
  readonly resourceUri: string;
  readonly opensApp: boolean;
}

export type McpAppArtifact = {
  readonly mcpApp: Omit<McpAppPlacement, 'catalogId'>;
};

type ToolRuntimeConfig = { toolCall?: { id?: string } };

export class McpAppTools {
  static readonly METADATA_KEY = 'mcpApp';

  static definitionsOf(
    listings: readonly McpToolListing[],
  ): McpAppToolDefinition[] {
    return listings.flatMap((listing) => {
      const resourceUri = McpAppTools.resourceUriOf(listing._meta);
      return resourceUri
        ? [
            {
              name: listing.name,
              resourceUri,
              opensApp: listing.annotations?.readOnlyHint === true,
            },
          ]
        : [];
    });
  }

  static openers(
    server: string,
    tools: readonly StructuredToolInterface[],
    definitions: readonly McpAppToolDefinition[],
  ): StructuredToolInterface[] {
    const opening = new Map(
      definitions
        .filter((definition) => definition.opensApp)
        .map((definition) => [definition.name, definition]),
    );
    return tools.flatMap((candidate) => {
      const definition = opening.get(candidate.name);
      return definition
        ? [McpAppTools.opener(server, candidate, definition)]
        : [];
    });
  }

  static isApp(candidate: unknown): boolean {
    const metadata = (candidate as { metadata?: Record<string, unknown> })
      ?.metadata;
    return metadata?.[McpAppTools.METADATA_KEY] !== undefined;
  }

  static placementOf(
    message: unknown,
  ): Omit<McpAppPlacement, 'catalogId'> | undefined {
    if (!ToolMessage.isInstance(message)) return undefined;
    const artifact = message.artifact as Partial<McpAppArtifact> | undefined;
    return artifact?.mcpApp;
  }

  static resultOf(message: unknown): McpToolResult {
    const text = McpAppTools.textOf(
      ToolMessage.isInstance(message) ? message.content : message,
    );
    const artifacts =
      ToolMessage.isInstance(message) && Array.isArray(message.artifact)
        ? (message.artifact as { type?: unknown; data?: unknown }[])
        : [];
    const structured = artifacts.find(
      (artifact) => artifact?.type === 'mcp_structured_content',
    )?.data;
    const meta = artifacts.find((artifact) => artifact?.type === 'mcp_meta')
      ?.data as Record<string, unknown> | undefined;
    return {
      content: text ? [{ type: 'text', text }] : [],
      ...(structured === undefined ? {} : { structuredContent: structured }),
      ...(meta ? { _meta: meta } : {}),
    };
  }

  static said(server: string, toolName: string, result: McpToolResult): string {
    const shown = McpAppTools.textOf(result.content);
    return [
      `The ${server} app is now open on the person's screen with what ${toolName} returned, and they act on it there: its own buttons do the saving. Do not repeat what it shows; say in one sentence what they can do in it.`,
      shown,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private static opener(
    server: string,
    inner: StructuredToolInterface,
    definition: McpAppToolDefinition,
  ): StructuredToolInterface {
    return tool(
      async (args: Record<string, unknown>, config?: ToolRuntimeConfig) => {
        const callId = config?.toolCall?.id ?? randomUUID();
        const message = await inner.invoke(
          { type: 'tool_call', id: callId, name: inner.name, args },
          config as never,
        );
        const toolResult = McpAppTools.resultOf(message);
        const artifact: McpAppArtifact = {
          mcpApp: {
            surfaceId: McpAppSurface.surfaceIdFor(definition.name, callId),
            server,
            resourceUri: definition.resourceUri,
            toolName: definition.name,
            toolInput: args,
            toolResult: { ...toolResult, content: [] },
          },
        };
        return [
          McpAppTools.said(server, definition.name, toolResult),
          artifact,
        ];
      },
      {
        name: inner.name,
        description: inner.description,
        schema: inner.schema as Record<string, unknown>,
        responseFormat: 'content_and_artifact',
        metadata: {
          [McpAppTools.METADATA_KEY]: {
            server,
            resourceUri: definition.resourceUri,
          },
        },
      },
    ) as unknown as StructuredToolInterface;
  }

  private static resourceUriOf(
    meta: Record<string, unknown> | undefined,
  ): string | undefined {
    const ui = meta?.ui as { resourceUri?: unknown } | undefined;
    if (typeof ui?.resourceUri === 'string') return ui.resourceUri;
    const legacy = meta?.['ui/resourceUri'];
    return typeof legacy === 'string' ? legacy : undefined;
  }

  private static textOf(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .map((block) =>
        block && typeof block === 'object' && 'text' in block
          ? String((block as { text: unknown }).text)
          : '',
      )
      .join('');
  }
}
