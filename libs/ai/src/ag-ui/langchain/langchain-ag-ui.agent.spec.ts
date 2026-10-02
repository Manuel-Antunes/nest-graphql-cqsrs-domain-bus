import { type BaseEvent, EventType, type Message } from '@ag-ui/client';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { tool } from '@langchain/core/tools';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { createAgent } from 'langchain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ScriptedModel,
  type ScriptedTurn,
} from '../../a2a/langchain/testing/scripted-model';
import { AgUiMiddleware } from './ag-ui.middleware';
import { AgUiEvents } from './ag-ui-events';
import { AgUiMessages } from './ag-ui-messages';
import { LangChainAgUiAgent } from './langchain-ag-ui.agent';

class RecordingModel extends ScriptedModel {
  readonly prompts: BaseMessage[][] = [];

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    this.prompts.push(messages);
    yield* super._streamResponseChunks(messages, options, runManager);
  }
}

class FailingModel extends ScriptedModel {
  override async *_streamResponseChunks(): AsyncGenerator<ChatGenerationChunk> {
    yield* [];
    throw new Error('the model is down');
  }
}

const lookups: string[] = [];

const lookup = tool(
  async ({ title }: { title: string }, config: LangGraphRunnableConfig) => {
    lookups.push(title);
    AgUiEvents.emit(config, {
      type: EventType.CUSTOM,
      name: 'lookup-progress',
      value: { title },
    });
    return `"${title}" was published yesterday.`;
  },
  {
    name: 'lookup_post',
    description: 'Finds a post by title.',
    schema: z.object({ title: z.string() }),
  },
);

const agentWith = (turns: ScriptedTurn[], history: Message[] = []) => {
  const model = new RecordingModel(turns);
  const graph = createAgent({
    model,
    tools: [lookup],
    systemPrompt: 'You are Theo.',
    middleware: [AgUiMiddleware.create()],
  });
  const agent = new LangChainAgUiAgent({
    graph,
    threadId: 'thread-1',
    initialMessages: [
      ...history,
      { id: 'user-1', role: 'user', content: 'When was "Hello" published?' },
    ],
  });
  return { agent, model };
};

const eventsOf = async (
  agent: LangChainAgUiAgent,
  parameters: Parameters<LangChainAgUiAgent['runAgent']>[0] = {},
) => {
  const events: BaseEvent[] = [];
  await agent.runAgent(parameters, {
    onEvent: ({ event }) => {
      events.push(event);
    },
  });
  return events;
};

describe('a LangChain agent served over AG-UI', () => {
  it('streams its text, its tool calls and their results as a stream the AG-UI client accepts', async () => {
    const { agent } = agentWith([
      {
        text: ['Let me ', 'look.'],
        toolCalls: [
          { id: 'call-1', name: 'lookup_post', args: { title: 'Hello' } },
        ],
      },
      { text: ['It was ', 'yesterday.'] },
    ]);

    const events = await eventsOf(agent);

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.CUSTOM,
      EventType.TOOL_CALL_RESULT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
    expect(
      agent.messages.map((message) => ({
        role: message.role,
        content: message.content,
        toolCalls:
          message.role === 'assistant'
            ? message.toolCalls?.map((call) => [
                call.function.name,
                JSON.parse(call.function.arguments),
              ])
            : undefined,
      })),
    ).toEqual([
      {
        role: 'user',
        content: 'When was "Hello" published?',
        toolCalls: undefined,
      },
      {
        role: 'assistant',
        content: 'Let me look.',
        toolCalls: [['lookup_post', { title: 'Hello' }]],
      },
      {
        role: 'tool',
        content: '"Hello" was published yesterday.',
        toolCalls: undefined,
      },
      {
        role: 'assistant',
        content: 'It was yesterday.',
        toolCalls: undefined,
      },
    ]);
    expect(lookups).toContain('Hello');
  });

  it('continues a conversation from the history the client sends, the calls nobody answered closed for the model', async () => {
    const { agent, model } = agentWith(
      [{ text: ['Anything else?'] }],
      [
        { id: 'user-0', role: 'user', content: 'Hi' },
        {
          id: 'assistant-0',
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call-0',
              type: 'function',
              function: { name: 'lookup_post', arguments: '{"title":"Old"}' },
            },
          ],
        },
        {
          id: 'sub-0',
          role: 'assistant',
          content: 'A delegate said this.',
          subagentRunId: 'call-0',
        },
      ],
    );

    await eventsOf(agent);

    const prompt = model.prompts[0].map((message) => [
      message.type,
      message.text,
    ]);
    expect(prompt).toEqual([
      ['system', 'You are Theo.'],
      ['human', 'Hi'],
      ['ai', ''],
      ['tool', AgUiMessages.MISSING_RESULT],
      ['human', 'When was "Hello" published?'],
    ]);
  });

  it('hands a frontend tool call to the client and ends the run there, with the application context in the prompt', async () => {
    const { agent, model } = agentWith([
      {
        toolCalls: [
          { id: 'call-2', name: 'show_toast', args: { text: 'Done' } },
        ],
      },
      { text: ['never reached'] },
    ]);

    const events = await eventsOf(agent, {
      tools: [
        {
          name: 'show_toast',
          description: 'Shows a toast in the page.',
          parameters: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
      ],
      context: [{ description: 'The page', value: '/feed' }],
    });

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.RUN_FINISHED,
    ]);
    expect(model.prompts).toHaveLength(1);
    expect(model.prompts[0][0].text).toContain('The page:\n/feed');
  });

  it('ends a failed run with RUN_ERROR, naming the failure', async () => {
    const graph = createAgent({
      model: new FailingModel([]),
      tools: [],
      middleware: [AgUiMiddleware.create()],
    });
    const agent = new LangChainAgUiAgent({
      graph,
      threadId: 'thread-2',
      initialMessages: [{ id: 'user-1', role: 'user', content: 'Hello?' }],
    });
    const events: BaseEvent[] = [];

    await agent
      .runAgent({}, { onEvent: ({ event }) => void events.push(event) })
      .catch(() => undefined);

    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'the model is down',
    });
  });
});
