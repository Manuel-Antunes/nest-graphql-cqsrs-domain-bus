import type { Message as A2aMessage, StreamResponse } from '@a2a-js/sdk';
import { TaskState } from '@a2a-js/sdk';
import { type BaseEvent, EventType, type Message } from '@ag-ui/client';
import { copilotkitMiddleware } from '@copilotkit/sdk-js/langgraph';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { MemorySaver } from '@langchain/langgraph';
import { createAgent } from 'langchain';
import { describe, expect, it } from 'vitest';

import type {
  RemoteA2aAgent,
  RemoteA2aAgents,
} from '../../a2a/client/remote-a2a-agents';
import { UnknownRemoteAgentError } from '../../a2a/client/remote-a2a-agents';
import { A2aPart } from '../../a2a/domain/a2a-part';
import { A2uiExtension } from '../../a2a/domain/extensions/a2ui.extension';
import {
  ScriptedModel,
  type ScriptedTurn,
} from '../../a2a/langchain/testing/scripted-model';
import { InProcessLangGraphClient } from '../langgraph/in-process-langgraph.client';
import { A2aMiddlewareAgent } from './a2a-middleware.agent';
import { DelegatedMessages } from './delegated-messages';

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

class FailingModel extends RecordingModel {
  override async *_streamResponseChunks(): AsyncGenerator<ChatGenerationChunk> {
    yield* [];
    throw new Error('the model is down');
  }
}

const CATALOG = 'nestposts://a2ui/catalogs/theo/v1';

const delegatingTo = (agentName: string, id = 'call-1'): ScriptedTurn => ({
  toolCalls: [
    {
      id,
      name: A2aMiddlewareAgent.DELEGATION_TOOL,
      args: { agentName, task: 'Tell me who I am.' },
    },
  ],
});

const postsManager = () => {
  const sent: { message: A2aMessage; parameters: Record<string, string> }[] =
    [];
  const agent: RemoteA2aAgent = {
    name: 'Posts Manager',
    description: 'Manages the posts.',
    card: {} as RemoteA2aAgent['card'],
    client: {
      sendMessageStream: async function* (
        { message }: { message: A2aMessage },
        { serviceParameters }: { serviceParameters: Record<string, string> },
      ): AsyncGenerator<StreamResponse> {
        sent.push({ message, parameters: serviceParameters });
        for (const text of ['The caller ', 'is Ana.']) {
          yield {
            payload: {
              $case: 'artifactUpdate',
              value: { artifact: { parts: [A2aPart.text(text)] } },
            },
          } as StreamResponse;
        }
        yield {
          payload: {
            $case: 'statusUpdate',
            value: { status: { state: TaskState.TASK_STATE_COMPLETED } },
          },
        } as StreamResponse;
      },
    } as unknown as RemoteA2aAgent['client'],
  };
  const agents: Pick<RemoteA2aAgents, 'names' | 'reach'> = {
    names: [agent.name],
    reach: async (name) => {
      if (name !== agent.name) {
        throw new UnknownRemoteAgentError(name, [agent.name]);
      }
      return agent;
    },
  };
  return { agents, sent };
};

const middlewareWith = (
  turns: ScriptedTurn[],
  model = new RecordingModel(turns),
) => {
  const { agents, sent } = postsManager();
  const graph = createAgent({
    model,
    tools: [],
    systemPrompt: 'You are Theo.',
    middleware: [copilotkitMiddleware],
    checkpointer: new MemorySaver(),
  });
  const agent = new A2aMiddlewareAgent({
    orchestrationAgent: InProcessLangGraphClient.agentOver(graph, {
      graphId: 'theo',
    }),
    agents,
    threadId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
  });
  return { agent, model, sent };
};

const run = async (
  agent: A2aMiddlewareAgent,
  messages: Message[],
  parameters: Parameters<A2aMiddlewareAgent['runAgent']>[0] = {},
) => {
  const events: BaseEvent[] = [];
  const conversation = agent.clone();
  conversation.setMessages(messages);
  await conversation
    .runAgent(parameters, {
      onEvent: ({ event }) => void events.push(event),
    })
    .catch(() => undefined);
  return { events, messages: conversation.messages };
};

const flowOf = (events: BaseEvent[]) =>
  events
    .map((event) => event.type)
    .filter(
      (type) =>
        type !== EventType.STEP_STARTED && type !== EventType.STEP_FINISHED,
    );

const ask = (content: string): Message => ({
  id: 'user-1',
  role: 'user',
  content,
});

describe('an AG-UI agent that consumes A2A agents as A2AMiddlewareAgent does', () => {
  it('runs the call to the remote agent, streams its answer as a subagent of the call, and runs the orchestrator again with the result', async () => {
    const { agent, model, sent } = middlewareWith([
      delegatingTo('Posts Manager'),
      { text: ['You are ', 'Ana.'] },
    ]);

    const { events, messages } = await run(agent, [ask('Who am I?')]);

    expect(flowOf(events)).toEqual([
      EventType.RUN_STARTED,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_END,
      EventType.SUBAGENT_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.SUBAGENT_FINISHED,
      EventType.TOOL_CALL_RESULT,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.MESSAGES_SNAPSHOT,
      EventType.RUN_FINISHED,
    ]);
    expect(events.some((event) => 'rawEvent' in event)).toBe(false);
    expect(A2aPart.textOf(sent[0].message.parts)).toBe('Tell me who I am.');
    expect(sent[0].message.contextId).toBe(agent.threadId);
    expect(model.prompts[0].at(0)?.text).toBe('You are Theo.');
    expect(model.prompts[1].map((message) => message.type)).toEqual([
      'system',
      'human',
      'ai',
      'tool',
    ]);
    expect(model.prompts[1].at(-1)?.text).toBe('The caller is Ana.');
    expect(
      messages.map((message) => [
        message.role,
        message.subagentRunId,
        message.role === 'tool' || message.role === 'assistant'
          ? message.content
          : undefined,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['user', undefined, undefined],
        ['assistant', undefined, ''],
        ['assistant', 'call-1', 'The caller is Ana.'],
        ['tool', undefined, 'The caller is Ana.'],
        ['assistant', undefined, 'You are Ana.'],
      ]),
    );
    expect(messages).toHaveLength(5);
  });

  it('keeps what the remote agent said in the conversation the next run starts from', async () => {
    const { agent, model } = middlewareWith([
      delegatingTo('Posts Manager'),
      { text: ['You are Ana.'] },
      { text: ['Anything else?'] },
    ]);
    const first = await run(agent, [ask('Who am I?')]);

    const second = await run(agent, [
      ...first.messages,
      { id: 'user-2', role: 'user', content: 'Thanks.' },
    ]);

    expect(
      second.messages.filter((message) => message.subagentRunId === 'call-1'),
    ).toHaveLength(1);
    expect(model.prompts[2].map((message) => message.type)).toEqual([
      'system',
      'human',
      'ai',
      'tool',
      'ai',
      'human',
    ]);
  });

  it('answers the orchestrator, not the person, when it names an agent nobody can reach', async () => {
    const { agent, model, sent } = middlewareWith([
      delegatingTo('Nobody'),
      { text: ['I could not reach it.'] },
    ]);

    const { events } = await run(agent, [ask('Who am I?')]);

    expect(sent).toHaveLength(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'call-1',
        content: expect.stringContaining('Posts Manager'),
      }),
    );
    expect(model.prompts[1].at(-1)?.text).toContain('Posts Manager');
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });

  it('declares the client’s A2UI catalog to the remote agent when the client renders McpApp', async () => {
    const { agent, sent } = middlewareWith([
      delegatingTo('Posts Manager'),
      { text: ['Done.'] },
    ]);

    await run(agent, [ask('Edit a post')], {
      context: [
        {
          description: 'A2UI Component Schema',
          value: JSON.stringify({
            catalogId: CATALOG,
            components: { McpApp: {}, Text: {} },
          }),
        },
      ],
    });

    expect(sent[0].message.metadata).toEqual({
      [A2uiExtension.CLIENT_CAPABILITIES_KEY]: {
        supportedCatalogIds: [CATALOG],
      },
    });
  });

  it('ends a failed run with RUN_ERROR, naming the failure', async () => {
    const { agent } = middlewareWith([], new FailingModel([]));

    const { events } = await run(agent, [ask('Hello?')]);

    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'the model is down',
    });
  });
});

describe('the messages an orchestrator is handed', () => {
  it('leaves out what remote agents said and what only the client draws, and closes the calls the conversation moved on from', () => {
    const messages = DelegatedMessages.forOrchestrator([
      { id: 'user-0', role: 'user', content: 'Hi' },
      {
        id: 'assistant-0',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-0',
            type: 'function',
            function: { name: 'send_message_to_a2a_agent', arguments: '{}' },
          },
        ],
      },
      {
        id: 'sub-0',
        role: 'assistant',
        content: 'A delegate said this.',
        subagentRunId: 'call-0',
      },
      {
        id: 'activity-0',
        role: 'activity',
        activityType: 'a2ui-surface',
        content: {},
      },
      { id: 'user-1', role: 'user', content: 'Again?' },
    ]);

    expect(messages.map((message) => [message.id, message.role])).toEqual([
      ['user-0', 'user'],
      ['assistant-0', 'assistant'],
      ['call-0:unanswered', 'tool'],
      ['user-1', 'user'],
    ]);
    expect(messages[2]).toMatchObject({
      toolCallId: 'call-0',
      content: DelegatedMessages.UNANSWERED,
    });
  });

  it('leaves a call the client is about to answer open', () => {
    const messages = DelegatedMessages.forOrchestrator([
      { id: 'user-0', role: 'user', content: 'Toast me' },
      {
        id: 'assistant-0',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-0',
            type: 'function',
            function: { name: 'show_toast', arguments: '{}' },
          },
        ],
      },
    ]);

    expect(messages).toHaveLength(2);
  });
});
