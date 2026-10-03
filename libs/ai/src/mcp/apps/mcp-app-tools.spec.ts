import { ToolMessage } from '@langchain/core/messages';
import { tool } from 'langchain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { McpAppSurface } from './mcp-app-surface';
import { McpAppTools } from './mcp-app-tools';

const RESOURCE = 'ui://widget/posts#abc';

const STRUCTURED = {
  result: { data: { me: { __typename: 'Author', id: 'u1' } } },
  toolName: 'ChoosePostToEdit',
};

function adapterTool(name: string) {
  return tool(
    async (args: Record<string, unknown>) => [
      JSON.stringify(STRUCTURED),
      [
        { type: 'mcp_structured_content', data: STRUCTURED },
        { type: 'mcp_meta', data: { toolName: name, seenArgs: args } },
      ],
    ],
    {
      name,
      description: `${name} description`,
      schema: z.object({ first: z.number().optional() }),
      responseFormat: 'content_and_artifact',
    },
  );
}

const LISTING = [
  {
    name: 'ChoosePostToEdit',
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri: RESOURCE, visibility: ['model', 'app'] } },
  },
  {
    name: 'SavePost',
    annotations: { readOnlyHint: false },
    _meta: { ui: { resourceUri: RESOURCE } },
  },
  {
    name: 'EditPost',
    _meta: { 'ui/resourceUri': RESOURCE },
    annotations: { readOnlyHint: true },
  },
  { name: 'ListPosts', annotations: { readOnlyHint: true } },
];

describe('McpAppTools', () => {
  it('knows the app tools by the ui resource their listing names', () => {
    expect(McpAppTools.definitionsOf(LISTING)).toEqual([
      { name: 'ChoosePostToEdit', resourceUri: RESOURCE, opensApp: true },
      { name: 'SavePost', resourceUri: RESOURCE, opensApp: false },
      { name: 'EditPost', resourceUri: RESOURCE, opensApp: true },
    ]);
  });

  it('hands the agent only the tools that open the app, never its buttons or plain operations', () => {
    const openers = McpAppTools.openers(
      'posts',
      ['ChoosePostToEdit', 'SavePost', 'ListPosts'].map(adapterTool),
      McpAppTools.definitionsOf(LISTING),
    );

    expect(openers.map((opener) => opener.name)).toEqual(['ChoosePostToEdit']);
    expect(McpAppTools.isApp(openers[0])).toBe(true);
    expect(McpAppTools.isApp(adapterTool('ListPosts'))).toBe(false);
  });

  it('answers the model in prose and carries the app placement as the artifact', async () => {
    const [opener] = McpAppTools.openers(
      'posts',
      [adapterTool('ChoosePostToEdit')],
      McpAppTools.definitionsOf(LISTING),
    );

    const message = await opener.invoke({
      type: 'tool_call',
      id: 'call 1',
      name: 'ChoosePostToEdit',
      args: { first: 5 },
    });

    expect(ToolMessage.isInstance(message)).toBe(true);
    expect((message as ToolMessage).content).toContain(
      "The posts app is now open on the person's screen",
    );
    expect((message as ToolMessage).content).toContain(
      JSON.stringify(STRUCTURED),
    );
    expect(McpAppTools.placementOf(message)).toEqual({
      surfaceId: 'mcp-app-ChoosePostToEdit-call-1',
      server: 'posts',
      resourceUri: RESOURCE,
      toolName: 'ChoosePostToEdit',
      toolInput: { first: 5 },
      toolResult: {
        content: [],
        structuredContent: STRUCTURED,
        _meta: { toolName: 'ChoosePostToEdit', seenArgs: { first: 5 } },
      },
    });
  });

  it('finds no placement on a plain tool message', () => {
    expect(
      McpAppTools.placementOf(
        new ToolMessage({ tool_call_id: 'x', content: 'plain' }),
      ),
    ).toBeUndefined();
    expect(McpAppTools.placementOf('plain')).toBeUndefined();
  });
});

describe('McpAppSurface', () => {
  it('places the app as the root McpApp of a v0.9 surface on the catalog it is given', () => {
    expect(
      McpAppSurface.messages({
        surfaceId: 's1',
        catalogId: 'nestposts://a2ui/catalogs/theo/v1',
        server: 'posts',
        resourceUri: RESOURCE,
        toolName: 'EditPost',
        toolInput: { id: 'p1' },
        toolResult: { structuredContent: STRUCTURED },
        title: 'Edit',
      }),
    ).toEqual([
      {
        version: 'v0.9',
        createSurface: {
          surfaceId: 's1',
          catalogId: 'nestposts://a2ui/catalogs/theo/v1',
        },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 's1',
          components: [
            {
              id: 'root',
              component: 'McpApp',
              server: 'posts',
              resourceUri: RESOURCE,
              toolName: 'EditPost',
              toolInput: { id: 'p1' },
              toolResult: { content: [], structuredContent: STRUCTURED },
              title: 'Edit',
            },
          ],
        },
      },
    ]);
  });

  it('builds a surface id a renderer can use as a key', () => {
    expect(McpAppSurface.surfaceIdFor('EditPost', 'tooluse_a/b:c')).toBe(
      'mcp-app-EditPost-tooluse_a-b-c',
    );
  });
});
