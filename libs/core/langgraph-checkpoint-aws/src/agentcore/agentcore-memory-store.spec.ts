import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

import { FakeAgentCoreMemory } from '../testing/fake-agentcore-memory';
import { AgentCoreMemoryStore } from './agentcore-memory-store';

const MEMORY = 'memory-1';

describe('AgentCoreMemoryStore', () => {
  it('puts a message as a conversational event of the actor and session its namespace names', async () => {
    const memory = new FakeAgentCoreMemory();
    const store = new AgentCoreMemoryStore(MEMORY, { client: memory });

    await store.put(['acme:ana', 'thread-1'], 'm-1', {
      message: new HumanMessage('I write about seafood.'),
    });
    await store.put(['acme:ana', 'thread-1'], 'm-2', {
      message: new AIMessage('Noted.'),
    });

    expect(
      memory
        .eventsOf('acme:ana', 'thread-1')
        .map((event) => event.payload?.[0]?.conversational),
    ).toEqual([
      { role: 'USER', content: { text: 'I write about seafood.' } },
      { role: 'ASSISTANT', content: { text: 'Noted.' } },
    ]);
  });

  it('puts nothing for a message without text, and refuses what is not a message or a namespace that is not an actor and a session', async () => {
    const memory = new FakeAgentCoreMemory();
    const store = new AgentCoreMemoryStore(MEMORY, { client: memory });

    await store.put(['acme:ana', 'thread-1'], 'm-1', {
      message: new AIMessage({
        content: '',
        tool_calls: [{ id: 'c', name: 'search', args: {} }],
      }),
    });

    expect(memory.events).toEqual([]);
    await expect(
      store.put(['acme:ana', 'thread-1'], 'm-2', { text: 'hello' }),
    ).rejects.toThrow(/BaseMessage/);
    await expect(
      store.put(['acme:ana'], 'm-3', { message: new HumanMessage('hi') }),
    ).rejects.toThrow(/actorId, sessionId/);
  });

  it('searches the records extracted under a namespace, and gets one by id', async () => {
    const memory = new FakeAgentCoreMemory();
    memory.records.push(
      {
        memoryRecordId: 'r-1',
        content: { text: 'Ana writes about seafood.' },
        memoryStrategyId: 'preferences',
        namespaces: ['/preferences/acme:ana'],
        createdAt: new Date('2026-10-01T00:00:00Z'),
        score: 0.9,
      },
      {
        memoryRecordId: 'r-2',
        content: { text: 'Bia writes about cars.' },
        memoryStrategyId: 'preferences',
        namespaces: ['/preferences/acme:bia'],
        createdAt: new Date('2026-10-01T00:00:00Z'),
      },
    );
    const store = new AgentCoreMemoryStore(MEMORY, { client: memory });

    const found = await store.search(['preferences', 'acme:ana'], {
      query: 'what does she write about?',
      limit: 5,
    });
    const record = await store.get(['preferences', 'acme:ana'], 'r-1');
    const missing = await store.get(['preferences', 'acme:ana'], 'r-404');

    expect(found).toEqual([
      expect.objectContaining({
        key: 'r-1',
        namespace: ['preferences', 'acme:ana'],
        value: {
          content: 'Ana writes about seafood.',
          memory_strategy_id: 'preferences',
          namespaces: ['/preferences/acme:ana'],
        },
        score: 0.9,
      }),
    ]);
    expect(record?.value.content).toBe('Ana writes about seafood.');
    expect(missing).toBeNull();
  });

  it('has nothing to search without a query', async () => {
    const memory = new FakeAgentCoreMemory();
    const store = new AgentCoreMemoryStore(MEMORY, { client: memory });

    expect(await store.search(['preferences', 'acme:ana'])).toEqual([]);
    expect(memory.calls).toEqual([]);
  });

  it('turns human, AI and tool messages into the roles AgentCore extracts from', () => {
    expect(
      AgentCoreMemoryStore.conversationalOf([
        new HumanMessage('Hi'),
        new AIMessage('Hello'),
        new ToolMessage({ content: '42', tool_call_id: 'c' }),
        new HumanMessage({
          content: 'saved before',
          additional_kwargs: { event_id: 'e-1' },
        }),
      ]).map(({ conversational }) => conversational.role),
    ).toEqual(['USER', 'ASSISTANT', 'TOOL']);
  });
});
