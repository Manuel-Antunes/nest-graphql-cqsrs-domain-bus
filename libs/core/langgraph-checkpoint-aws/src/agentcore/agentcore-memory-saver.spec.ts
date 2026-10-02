import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import {
  Command,
  END,
  interrupt,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';

import { FakeAgentCoreMemory } from '../testing/fake-agentcore-memory';
import { AgentCoreEventClient } from './agentcore-event-client';
import {
  AgentCoreMemorySaver,
  type CheckpointFormat,
} from './agentcore-memory-saver';
import { AgentCoreSnapshotClient } from './agentcore-snapshot-client';
import { CheckpointReadLimitError, InvalidConfigError } from './constants';

const MEMORY = 'memory-1';

const echoGraph = (saver: AgentCoreMemorySaver) =>
  new StateGraph(MessagesAnnotation)
    .addNode('answer', ({ messages }) => ({
      messages: [new AIMessage(`heard ${messages.length} message(s)`)],
    }))
    .addEdge(START, 'answer')
    .addEdge('answer', END)
    .compile({ checkpointer: saver });

const configOf = (thread: string, actor = 'acme:ana') => ({
  configurable: { thread_id: thread, actor_id: actor },
});

const textsOf = (messages: BaseMessage[]) =>
  messages.map((message) => message.text);

describe.each<CheckpointFormat>(['legacy', 'snapshot'])(
  'AgentCoreMemorySaver, %s format',
  (checkpointFormat) => {
    const saverOn = (memory: FakeAgentCoreMemory) =>
      new AgentCoreMemorySaver(MEMORY, { client: memory, checkpointFormat });

    it('resumes a thread from AgentCore Memory in another process', async () => {
      const memory = new FakeAgentCoreMemory();
      await echoGraph(saverOn(memory)).invoke(
        { messages: [new HumanMessage('Hello')] },
        configOf('thread-1'),
      );

      const resumed = await echoGraph(saverOn(memory)).invoke(
        { messages: [new HumanMessage('Again')] },
        configOf('thread-1'),
      );

      expect(textsOf(resumed.messages)).toEqual([
        'Hello',
        'heard 1 message(s)',
        'Again',
        'heard 3 message(s)',
      ]);
      expect(memory.sessionsOf('acme:ana')).toContain('thread-1');
    });

    it('keeps the same thread of another actor apart', async () => {
      const memory = new FakeAgentCoreMemory();
      await echoGraph(saverOn(memory)).invoke(
        { messages: [new HumanMessage('Mine')] },
        configOf('thread-1', 'acme:ana'),
      );

      const other = await echoGraph(saverOn(memory)).invoke(
        { messages: [new HumanMessage('Hers')] },
        configOf('thread-1', 'globex:ana'),
      );

      expect(textsOf(other.messages)).toEqual(['Hers', 'heard 1 message(s)']);
    });

    it('lists the checkpoints of a thread newest first, before one and up to a limit', async () => {
      const memory = new FakeAgentCoreMemory();
      const graph = echoGraph(saverOn(memory));
      await graph.invoke(
        { messages: [new HumanMessage('One')] },
        configOf('thread-1'),
      );
      await graph.invoke(
        { messages: [new HumanMessage('Two')] },
        configOf('thread-1'),
      );

      const listed = [];
      for await (const tuple of saverOn(memory).list(configOf('thread-1'))) {
        listed.push(tuple);
      }
      const ids = listed.map((tuple) => tuple.checkpoint.id);
      const older = [];
      for await (const tuple of saverOn(memory).list(configOf('thread-1'), {
        before: listed[1].config,
        limit: 2,
      })) {
        older.push(tuple.checkpoint.id);
      }

      expect(ids).toEqual([...ids].sort().reverse());
      expect(listed[0].parentConfig?.configurable?.checkpoint_id).toBe(ids[1]);
      expect(older).toEqual(ids.slice(2, 4));
    });

    it('resumes a run an interrupt paused, with the answer given later', async () => {
      const memory = new FakeAgentCoreMemory();
      const approvalGraph = (saver: AgentCoreMemorySaver) =>
        new StateGraph(MessagesAnnotation)
          .addNode('ask', () => {
            const decision = interrupt('Publish it?');
            return {
              messages: [new AIMessage(`decided: ${String(decision)}`)],
            };
          })
          .addEdge(START, 'ask')
          .addEdge('ask', END)
          .compile({ checkpointer: saver });
      const paused = await approvalGraph(saverOn(memory)).invoke(
        { messages: [new HumanMessage('Publish my post')] },
        configOf('thread-1'),
      );

      const resumed = await approvalGraph(saverOn(memory)).invoke(
        new Command({ resume: 'yes' }),
        configOf('thread-1'),
      );

      expect(
        (paused as { __interrupt__?: { value: unknown }[] }).__interrupt__?.[0]
          ?.value,
      ).toBe('Publish it?');
      expect(textsOf(resumed.messages)).toEqual([
        'Publish my post',
        'decided: yes',
      ]);
    });

    it('answers a tool call a checkpoint left without a result, so the model accepts the history', async () => {
      const memory = new FakeAgentCoreMemory();
      const saver = saverOn(memory);
      const graph = new StateGraph(MessagesAnnotation)
        .addNode('call', () => ({
          messages: [
            new AIMessage({
              content: '',
              tool_calls: [{ id: 'call-1', name: 'search', args: {} }],
            }),
          ],
        }))
        .addEdge(START, 'call')
        .addEdge('call', END)
        .compile({ checkpointer: saver });
      await graph.invoke(
        { messages: [new HumanMessage('Search')] },
        configOf('thread-1'),
      );

      const tuple = await saverOn(memory).getTuple(configOf('thread-1'));
      const messages = tuple?.checkpoint.channel_values
        .messages as BaseMessage[];

      expect(messages.at(-1)).toBeInstanceOf(ToolMessage);
      expect(messages.at(-1)).toMatchObject({
        tool_call_id: 'call-1',
        status: 'error',
      });
    });

    it('deletes everything of a thread, and needs to be told whose thread it is', async () => {
      const memory = new FakeAgentCoreMemory();
      const saver = saverOn(memory);
      await echoGraph(saver).invoke(
        { messages: [new HumanMessage('Forget me')] },
        configOf('thread-1'),
      );

      await expect(saver.deleteThread('thread-1')).rejects.toBeInstanceOf(
        InvalidConfigError,
      );
      await saver.deleteThread('thread-1', 'acme:ana');

      expect(memory.eventsOf('acme:ana')).toEqual([]);
      expect(await saver.getTuple(configOf('thread-1'))).toBeUndefined();
    });

    it('refuses a config without the actor the session belongs to', async () => {
      await expect(
        saverOn(new FakeAgentCoreMemory()).getTuple({
          configurable: { thread_id: 'thread-1' },
        }),
      ).rejects.toBeInstanceOf(InvalidConfigError);
    });
  },
);

describe('AgentCoreMemorySaver, legacy format', () => {
  it('reads the latest checkpoint after skipping a blob it cannot decode', async () => {
    const memory = new FakeAgentCoreMemory();
    const saver = new AgentCoreMemorySaver(MEMORY, { client: memory });
    await echoGraph(saver).invoke(
      { messages: [new HumanMessage('Hello')] },
      configOf('thread-1'),
    );
    await memory.send(
      new (
        await import('@aws-sdk/client-bedrock-agentcore')
      ).CreateEventCommand({
        memoryId: MEMORY,
        actorId: 'acme:ana',
        sessionId: 'thread-1',
        eventTimestamp: new Date(),
        payload: [{ blob: 'not json' }],
      }),
    );

    const tuple = await saver.getTuple(configOf('thread-1'));

    expect(
      textsOf(tuple?.checkpoint.channel_values.messages as BaseMessage[]),
    ).toEqual(['Hello', 'heard 1 message(s)']);
  });

  it('refuses a read its limit cut short of the checkpoint', async () => {
    const memory = new FakeAgentCoreMemory();
    await echoGraph(
      new AgentCoreMemorySaver(MEMORY, { client: memory }),
    ).invoke({ messages: [new HumanMessage('Hello')] }, configOf('thread-1'));

    await expect(
      new AgentCoreMemorySaver(MEMORY, {
        client: memory,
        limit: 1,
        maxResults: 1,
      }).getTuple(configOf('thread-1')),
    ).rejects.toBeInstanceOf(CheckpointReadLimitError);
  });

  it('spreads events over as few CreateEvent calls as the limits allow', () => {
    expect(
      AgentCoreEventClient.chunkPayload(['aa', 'bb', 'cc', 'dd', 'ee'], 2, 100),
    ).toEqual([['aa', 'bb'], ['cc', 'dd'], ['ee']]);
    expect(
      AgentCoreEventClient.chunkPayload(['aaaa', 'bb', 'cccc'], 10, 6),
    ).toEqual([['aaaa', 'bb'], ['cccc']]);
  });

  it('cannot read a thread that holds snapshots', async () => {
    const memory = new FakeAgentCoreMemory();
    await echoGraph(
      new AgentCoreMemorySaver(MEMORY, {
        client: memory,
        checkpointFormat: 'snapshot',
      }),
    ).invoke({ messages: [new HumanMessage('Hello')] }, configOf('thread-1'));

    await expect(
      new AgentCoreMemorySaver(MEMORY, { client: memory }).getTuple(
        configOf('thread-1'),
      ),
    ).rejects.toBeInstanceOf(InvalidConfigError);
  });
});

describe('AgentCoreMemorySaver, snapshot format', () => {
  it('loads the latest checkpoint of a long thread in two ListEvents calls', async () => {
    const memory = new FakeAgentCoreMemory();
    const saver = new AgentCoreMemorySaver(MEMORY, {
      client: memory,
      checkpointFormat: 'snapshot',
    });
    for (const text of ['One', 'Two', 'Three', 'Four']) {
      await echoGraph(saver).invoke(
        { messages: [new HumanMessage(text)] },
        configOf('thread-1'),
      );
    }
    memory.calls.length = 0;

    const tuple = await saver.getTuple(configOf('thread-1'));

    expect(
      textsOf(tuple?.checkpoint.channel_values.messages as BaseMessage[]),
    ).toHaveLength(8);
    expect(memory.calls.filter((call) => call === 'ListEvents')).toHaveLength(
      2,
    );
  });

  it('keeps pending writes in a session of their own per checkpoint, and deletes them with the thread', async () => {
    const memory = new FakeAgentCoreMemory();
    const saver = new AgentCoreMemorySaver(MEMORY, {
      client: memory,
      checkpointFormat: 'snapshot',
    });
    await echoGraph(saver).invoke(
      { messages: [new HumanMessage('Hello')] },
      configOf('thread-1'),
    );

    const writesSessions = memory
      .sessionsOf('acme:ana')
      .filter((session) => session.startsWith('lgw-'));
    await saver.deleteThread('thread-1', 'acme:ana');

    expect(writesSessions.length).toBeGreaterThan(0);
    expect(
      writesSessions.every((session) =>
        session.startsWith(
          AgentCoreSnapshotClient.writesSessionId('thread-1', 'x').slice(0, 37),
        ),
      ),
    ).toBe(true);
    expect(memory.eventsOf('acme:ana')).toEqual([]);
  });
});
