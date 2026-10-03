import {
  type BaseEvent,
  EventType,
  type Message,
  type TextMessageStartEvent,
} from '@ag-ui/client';
import type { LangGraphAgent } from '@ag-ui/langgraph';
import { copilotkitMiddleware } from '@copilotkit/sdk-js/langgraph';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { tool } from '@langchain/core/tools';
import {
  type LangGraphRunnableConfig,
  MemorySaver,
} from '@langchain/langgraph';
import { AgentCoreMemorySaver } from '@nestposts/langgraph-checkpoint-aws';
import { FakeAgentCoreMemory } from '@nestposts/langgraph-checkpoint-aws/testing/fake-agentcore-memory';
import { createAgent } from 'langchain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ScriptedModel,
  type ScriptedTurn,
} from '../../a2a/langchain/testing/scripted-model';
import type { AgentContext } from '../../agents/context/agent-context';
import { AgentRunContext } from '../../agents/context/agent-run-context';
import { InProcessLangGraphClient } from './in-process-langgraph.client';

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

const ana: AgentContext = {
  isAuthenticated: true,
  userName: 'user-ana',
  tenant: 'acme',
  actorId: 'acme:user-ana',
  credential: 'the-callers-token',
};

const configsSeen: LangGraphRunnableConfig[] = [];

const lookup = tool(
  async ({ title }: { title: string }, config: LangGraphRunnableConfig) => {
    configsSeen.push(config);
    return `"${title}" was published yesterday.`;
  },
  {
    name: 'lookup_post',
    description: 'Finds a post by title.',
    schema: z.object({ title: z.string() }),
  },
);

const showToast = {
  name: 'show_toast',
  description: 'Shows a toast in the page.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
};

const agentWith = (
  turns: ScriptedTurn[],
  checkpointer: MemorySaver | AgentCoreMemorySaver = new MemorySaver(),
) => {
  const model = new RecordingModel(turns);
  const graph = createAgent({
    model,
    tools: [lookup],
    systemPrompt: 'You are Theo.',
    middleware: [copilotkitMiddleware],
    checkpointer,
  });
  return {
    agent: InProcessLangGraphClient.agentOver(graph, { graphId: 'theo' }),
    model,
  };
};

const user = (id: string, content: string): Message => ({
  id,
  role: 'user',
  content,
});

const run = async (
  agent: ReturnType<typeof agentWith>['agent'],
  messages: Message[],
  tools = [] as (typeof showToast)[],
) => {
  const events: BaseEvent[] = [];
  const conversation = agent.clone() as LangGraphAgent;
  conversation.threadId = 'thread-1';
  conversation.setMessages(messages);
  await conversation.runAgent(
    { tools },
    { onEvent: ({ event }) => void events.push(event) },
  );
  return { events, messages: conversation.messages };
};

const withoutSteps = (events: BaseEvent[]) =>
  events
    .map((event) => event.type)
    .filter(
      (type) =>
        type !== EventType.STEP_STARTED &&
        type !== EventType.STEP_FINISHED &&
        type !== EventType.STATE_SNAPSHOT &&
        type !== EventType.RAW,
    );

describe('a LangGraph agent run in process, as LangGraphAgent drives a LangGraph deployment', () => {
  it('streams its text, its tool calls and their results, and ends with the checkpoint as the conversation', async () => {
    const { agent } = agentWith([
      {
        text: ['Let me ', 'look.'],
        toolCalls: [
          { id: 'call-1', name: 'lookup_post', args: { title: 'Hello' } },
        ],
      },
      { text: ['It was ', 'yesterday.'] },
    ]);

    const { events, messages } = await run(agent, [
      user('user-1', 'When was "Hello" published?'),
    ]);

    expect(withoutSteps(events)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
      EventType.TOOL_CALL_RESULT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.MESSAGES_SNAPSHOT,
      EventType.RUN_FINISHED,
    ]);
    expect(
      messages.map((message) => [
        message.role,
        message.content,
        message.role === 'assistant'
          ? message.toolCalls?.map((call) => call.function.name)
          : undefined,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['user', 'When was "Hello" published?', undefined],
        ['assistant', 'Let me look.', ['lookup_post']],
        ['tool', '"Hello" was published yesterday.', undefined],
        ['assistant', 'It was yesterday.', []],
      ]),
    );
    expect(messages).toHaveLength(4);
  });

  it('streams a message under the id the checkpoint keeps it by', async () => {
    const { agent } = agentWith([{ text: ['Hi.'] }]);

    const { events, messages } = await run(agent, [user('user-1', 'Hello')]);

    const started = events.find(
      (event): event is TextMessageStartEvent =>
        event.type === EventType.TEXT_MESSAGE_START,
    );
    expect(started?.messageId).toMatch(/^run-/);
    expect(messages.at(-1)?.id).toBe(started?.messageId);
  });

  it('hands a call to a tool of the client to the client and ends the run there, then resumes from the checkpoint with its result', async () => {
    const { agent, model } = agentWith([
      {
        toolCalls: [
          { id: 'call-2', name: 'show_toast', args: { text: 'Done' } },
        ],
      },
      { text: ['The toast is up.'] },
    ]);

    const first = await run(agent, [user('user-1', 'Toast me')], [showToast]);
    const second = await run(
      agent,
      [
        ...first.messages,
        {
          id: 'tool-1',
          role: 'tool',
          toolCallId: 'call-2',
          content: 'shown',
        },
      ],
      [showToast],
    );

    expect(withoutSteps(first.events)).toEqual([
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_END,
      EventType.MESSAGES_SNAPSHOT,
      EventType.RUN_FINISHED,
    ]);
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[1].map((message) => message.type)).toEqual([
      'system',
      'human',
      'ai',
      'tool',
    ]);
    expect(second.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('keeps the thread as the caller’s in their tenant, and never hands the graph their credential', async () => {
    const memory = new FakeAgentCoreMemory();
    const { agent, model } = agentWith(
      [
        {
          toolCalls: [
            { id: 'call-3', name: 'lookup_post', args: { title: 'Hello' } },
          ],
        },
        { text: ['Yesterday.'] },
      ],
      new AgentCoreMemorySaver('memory', {
        client: memory,
        checkpointFormat: 'snapshot',
      }),
    );

    await AgentRunContext.within(ana, () =>
      run(agent, [user('user-1', 'When was "Hello" published?')]),
    );

    expect(memory.sessionsOf('acme:user-ana')).toContain('thread-1');
    const config = configsSeen.at(-1);
    expect(config?.configurable).toMatchObject({
      thread_id: 'thread-1',
      actor_id: 'acme:user-ana',
      tenant: 'acme',
      user_id: 'user-ana',
    });
    expect(JSON.stringify(config?.configurable)).not.toContain(ana.credential);
    expect(JSON.stringify(config?.context ?? null)).not.toContain(
      ana.credential,
    );
    expect(JSON.stringify(model.prompts)).not.toContain(ana.credential);
  });
});
