import { TaskState } from '@a2a-js/sdk';
import { MemorySaver } from '@langchain/langgraph';
import { createAgent, tool } from 'langchain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { McpAppTools } from '../../mcp/apps/mcp-app-tools';
import { A2uiExtension } from '../domain/extensions/a2ui.extension';
import { A2aMiddleware } from './a2a.middleware';
import { ScriptedModel, type ScriptedTurn } from './testing/scripted-model';
import { TurnHarness } from './testing/turn-harness';

const CATALOG = 'nestposts://a2ui/catalogs/theo/v1';
const RESOURCE = 'ui://widget/posts#abc';
const STRUCTURED = { result: { data: { me: { id: 'u1' } } } };

class RecordingModel extends ScriptedModel {
  readonly offered: string[][] = [];

  override bindTools(tools: { name: string }[] = []) {
    this.offered.push(tools.map((candidate) => candidate.name));
    return this as never;
  }
}

const listPosts = tool(async () => 'two posts', {
  name: 'ListPosts',
  description: 'Lists posts.',
  schema: z.object({}),
});

const choosePost = McpAppTools.openers(
  'posts',
  [
    tool(
      async () => [
        JSON.stringify(STRUCTURED),
        [{ type: 'mcp_structured_content', data: STRUCTURED }],
      ],
      {
        name: 'ChoosePostToEdit',
        description: 'Shows the posts to pick one.',
        schema: z.object({}),
        responseFormat: 'content_and_artifact',
      },
    ),
  ],
  [{ name: 'ChoosePostToEdit', resourceUri: RESOURCE, opensApp: true }],
);

function agentWith(turns: ScriptedTurn[]) {
  const model = new RecordingModel(turns);
  const agent = createAgent({
    model,
    tools: [listPosts, ...choosePost],
    middleware: [A2aMiddleware.create()],
    checkpointer: new MemorySaver(),
  });
  return { model, agent };
}

const a2ui = new A2uiExtension();

describe('a turn whose client renders A2UI', () => {
  it('offers the app, and answers with its surface on the catalog the client named', async () => {
    const { model, agent } = agentWith([
      { toolCalls: [{ id: 'c1', name: 'ChoosePostToEdit', args: {} }] },
      { text: ['Pick the one you want to edit.'] },
    ]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-a2ui',
      text: 'I want to edit a post',
      metadata: {
        [A2uiExtension.CLIENT_CAPABILITIES_KEY]: a2ui.clientCapabilities([
          CATALOG,
        ]),
      },
    });

    expect(model.offered[0]).toEqual(
      expect.arrayContaining(['ListPosts', 'ChoosePostToEdit']),
    );
    expect(turn.finalState).toBe(TaskState.TASK_STATE_COMPLETED);
    const final = turn.bus.events.at(-1);
    const parts =
      final?.kind === 'statusUpdate'
        ? (final.data.status?.message?.parts ?? [])
        : [];
    expect(a2ui.messagesIn(parts)).toEqual([
      {
        version: 'v0.9',
        createSurface: {
          surfaceId: 'mcp-app-ChoosePostToEdit-c1',
          catalogId: CATALOG,
        },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'mcp-app-ChoosePostToEdit-c1',
          components: [
            {
              id: 'root',
              component: 'McpApp',
              server: 'posts',
              resourceUri: RESOURCE,
              toolName: 'ChoosePostToEdit',
              toolInput: {},
              toolResult: { content: [], structuredContent: STRUCTURED },
            },
          ],
        },
      },
    ]);
    expect(turn.artifactText).toBe('Pick the one you want to edit.');
  });
});

describe('a turn whose client renders no A2UI', () => {
  it('never offers the app, and answers in prose alone', async () => {
    const { model, agent } = agentWith([{ text: ['You have two posts.'] }]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-plain',
      text: 'I want to edit a post',
    });

    expect(model.offered[0]).toContain('ListPosts');
    expect(model.offered[0]).not.toContain('ChoosePostToEdit');
    const final = turn.bus.events.at(-1);
    const parts =
      final?.kind === 'statusUpdate'
        ? (final.data.status?.message?.parts ?? [])
        : [];
    expect(a2ui.messagesIn(parts)).toEqual([]);
  });
});
