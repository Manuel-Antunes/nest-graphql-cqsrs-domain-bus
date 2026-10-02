import { extractCatalogComponentSchemas } from '@copilotkit/a2ui-renderer';
import { describe, expect, it } from 'vitest';

import { THEO_A2UI_CATALOG_ID, theoCatalog } from './catalog';
import { McpAppContent } from './mcp-app-frame';

describe("Theo's A2UI catalog", () => {
  it('is the basic catalog plus McpApp, under an id of its own', () => {
    expect(theoCatalog.id).toBe(THEO_A2UI_CATALOG_ID);
    expect(theoCatalog.components.has('McpApp')).toBe(true);
    expect(theoCatalog.components.has('Text')).toBe(true);
    expect(theoCatalog.components.has('Button')).toBe(true);
  });

  it('tells the agent the catalog id and the McpApp component, the way Theo reads them', () => {
    const schema = JSON.parse(
      JSON.stringify(extractCatalogComponentSchemas(theoCatalog)),
    ) as { catalogId: string; components: Record<string, unknown> };

    expect(schema.catalogId).toBe(THEO_A2UI_CATALOG_ID);
    expect(schema.components.McpApp).toMatchObject({
      allOf: [
        { $ref: 'common_types.json#/$defs/ComponentCommon' },
        {
          properties: {
            component: { const: 'McpApp' },
            server: { type: 'string' },
            resourceUri: { type: 'string' },
            toolName: { type: 'string' },
          },
          required: ['component', 'server', 'resourceUri', 'toolName'],
        },
      ],
    });
  });
});

describe('McpAppContent', () => {
  it('is what CopilotKit’s MCP Apps host takes, the server named by id', () => {
    expect(
      McpAppContent.of({
        server: 'posts',
        resourceUri: 'ui://widget/posts#abc',
        toolName: 'ChoosePostToEdit',
        toolResult: { structuredContent: { toolName: 'ChoosePostToEdit' } },
      }),
    ).toEqual({
      resourceUri: 'ui://widget/posts#abc',
      serverId: 'posts',
      serverHash: 'posts',
      toolInput: {},
      result: {
        content: [],
        structuredContent: { toolName: 'ChoosePostToEdit' },
      },
    });
  });
});
