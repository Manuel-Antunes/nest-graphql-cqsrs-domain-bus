import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { MemorySaver } from '@langchain/langgraph';
import { createAgent } from 'langchain';

import type {
  ConversationMemory,
  ConversationThread,
  ConversationTurn,
} from './conversation-memory';
import { ConversationMemoryMiddleware } from './conversation-memory.middleware';

class RecordingMemory {
  readonly remembered: ConversationTurn[][] = [];
  readonly recalled: ConversationThread[] = [];

  constructor(private readonly history: ConversationTurn[] = []) {}

  async remember(
    _thread: ConversationThread,
    turns: readonly ConversationTurn[],
  ): Promise<void> {
    this.remembered.push([...turns]);
  }

  async recall(thread: ConversationThread): Promise<ConversationTurn[]> {
    this.recalled.push(thread);
    return this.history;
  }
}

const config = (thread: string) => ({
  configurable: { thread_id: thread, user_id: 'user-1' },
});

const agentWith = (memory: RecordingMemory, answers: string[]) =>
  createAgent({
    model: new FakeListChatModel({ responses: answers }),
    tools: [],
    middleware: [
      ConversationMemoryMiddleware.create(
        memory as unknown as ConversationMemory,
      ),
    ],
    checkpointer: new MemorySaver(),
  });

const textsOf = (messages: { text: string }[]) =>
  messages.map((message) => message.text);

describe('a conversation that outlives the runtime session it started in', () => {
  it('starts a thread this session never saw from what AgentCore remembers of it', async () => {
    const memory = new RecordingMemory([
      { role: 'user', text: 'my name is Ana' },
      { role: 'assistant', text: 'nice to meet you, Ana' },
    ]);
    const agent = agentWith(memory, ['you are Ana']);

    const state = await agent.invoke(
      { messages: [new HumanMessage('who am I?')] },
      config('context-1'),
    );

    expect(memory.recalled).toEqual([
      { actorId: 'user-1', sessionId: 'context-1' },
    ]);
    expect(textsOf(state.messages)).toEqual([
      'my name is Ana',
      'nice to meet you, Ana',
      'who am I?',
      'you are Ana',
    ]);
  });

  it('remembers every turn, the question and the final answer', async () => {
    const memory = new RecordingMemory();
    const agent = agentWith(memory, ['hello']);

    await agent.invoke({ messages: [new HumanMessage('hi')] }, config('c-2'));

    expect(memory.remembered).toEqual([
      [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'hello' },
      ],
    ]);
  });

  it('does not ask AgentCore again once the thread is under way here', async () => {
    const memory = new RecordingMemory();
    const agent = agentWith(memory, ['one', 'two']);

    await agent.invoke({ messages: [new HumanMessage('1')] }, config('c-3'));
    await agent.invoke({ messages: [new HumanMessage('2')] }, config('c-3'));

    expect(memory.recalled).toHaveLength(1);
  });

  it('leaves a run that names no caller or no thread alone', () => {
    expect(
      ConversationMemoryMiddleware.threadOf({ thread_id: 'c-1' }),
    ).toBeUndefined();
    expect(
      ConversationMemoryMiddleware.threadOf({ user_id: 'u-1' }),
    ).toBeUndefined();
  });

  it('takes the last question and the last answer that called no tool', () => {
    expect(
      ConversationMemoryMiddleware.lastTurnOf([
        new HumanMessage('first'),
        new AIMessage('first answer'),
        new HumanMessage('second'),
        new AIMessage({
          content: '',
          tool_calls: [{ id: 't1', name: 'ListPosts', args: {} }],
        }),
        new AIMessage('second answer'),
      ]),
    ).toEqual([
      { role: 'user', text: 'second' },
      { role: 'assistant', text: 'second answer' },
    ]);
  });
});
