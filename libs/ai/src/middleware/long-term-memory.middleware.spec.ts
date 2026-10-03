import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { type BaseMessage, HumanMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { AgentCoreMemoryStore } from '@nestposts/langgraph-checkpoint-aws';
import { FakeAgentCoreMemory } from '@nestposts/langgraph-checkpoint-aws/testing/fake-agentcore-memory';
import { createAgent } from 'langchain';
import { describe, expect, it } from 'vitest';

import {
  ScriptedModel,
  type ScriptedTurn,
} from '../a2a/langchain/testing/scripted-model';
import { LongTermMemoryMiddleware } from './long-term-memory.middleware';

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

const agentOn = (
  memory: FakeAgentCoreMemory,
  turns: ScriptedTurn[],
  { compiledWithTheStore = true } = {},
) => {
  const model = new RecordingModel(turns);
  const agent = createAgent({
    model,
    tools: [],
    systemPrompt: 'You are Theo.',
    ...(compiledWithTheStore && {
      store: new AgentCoreMemoryStore('memory', { client: memory }),
    }),
    middleware: [
      LongTermMemoryMiddleware.create({ recall: ['preferences', 'facts'] }),
    ],
  });
  return { agent, model };
};

const run = async (
  agent: ReturnType<typeof agentOn>['agent'],
  text: string,
  configurable: Record<string, string>,
) => {
  for await (const _ of await agent.stream(
    { messages: [new HumanMessage(text)] },
    { configurable, streamMode: 'messages' },
  )) {
  }
};

describe('long-term memory in AgentCore Memory, as AWS integrates it with LangGraph', () => {
  it('saves what the person said and the final answer as conversation of their actor and thread, for the strategies to extract from', async () => {
    const memory = new FakeAgentCoreMemory();
    const { agent } = agentOn(memory, [{ text: ['Noted, you like tuna.'] }]);

    await run(agent, 'I like tuna.', {
      thread_id: 'thread-1',
      actor_id: 'acme:ana',
    });

    expect(
      memory
        .eventsOf('acme:ana', 'thread-1')
        .map((event) => event.payload?.[0]?.conversational),
    ).toEqual([
      { role: 'USER', content: { text: 'I like tuna.' } },
      { role: 'ASSISTANT', content: { text: 'Noted, you like tuna.' } },
    ]);
  });

  it('tells the model what was extracted about the person in their tenant, and nothing of anybody else', async () => {
    const memory = new FakeAgentCoreMemory();
    memory.records.push(
      {
        memoryRecordId: 'r-1',
        content: { text: 'Ana likes seafood, tuna above all.' },
        memoryStrategyId: 'preferences',
        namespaces: ['/preferences/acme:ana'],
        createdAt: new Date(),
      },
      {
        memoryRecordId: 'r-2',
        content: { text: 'Ana prefers cars, in another organization.' },
        memoryStrategyId: 'preferences',
        namespaces: ['/preferences/globex:ana'],
        createdAt: new Date(),
      },
    );
    const { agent, model } = agentOn(memory, [{ text: ['Grilled tuna.'] }]);

    await run(agent, 'What should I cook tonight?', {
      thread_id: 'thread-2',
      actor_id: 'acme:ana',
    });

    const system = model.prompts[0][0].text;
    expect(system).toContain(LongTermMemoryMiddleware.HEADING);
    expect(system).toContain('Ana likes seafood, tuna above all.');
    expect(system).not.toContain('cars');
  });

  it('uses the store the graph was compiled with, and remembers nothing in a graph that has none', async () => {
    const memory = new FakeAgentCoreMemory();
    const { agent, model } = agentOn(memory, [{ text: ['Hi.'] }], {
      compiledWithTheStore: false,
    });

    await run(agent, 'I like tuna.', {
      thread_id: 'thread-4',
      actor_id: 'acme:ana',
    });

    expect(memory.calls).toEqual([]);
    expect(model.prompts).toHaveLength(1);
  });

  it('remembers nothing for a run that names no actor', async () => {
    const memory = new FakeAgentCoreMemory();
    const { agent, model } = agentOn(memory, [{ text: ['Hi.'] }]);

    await run(agent, 'Hello', { thread_id: 'thread-3' });

    expect(memory.calls).toEqual([]);
    expect(model.prompts[0][0].text).not.toContain(
      LongTermMemoryMiddleware.HEADING,
    );
  });
});
