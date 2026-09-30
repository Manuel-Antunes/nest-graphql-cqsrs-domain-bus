import { Role, type Task, TaskState } from '@a2a-js/sdk';
import { ServerCallContext } from '@a2a-js/sdk/server';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { InMemoryStore } from '@langchain/langgraph';

import { A2aPart } from '../domain/a2a-part';
import { ClientToolsExtension } from '../domain/extensions/client-tools.extension';
import { LangChainTaskStore } from './langchain-task-store';

function stubCheckpointer(threads: Record<string, BaseMessage[]>) {
  return {
    async getTuple(config: { configurable?: { thread_id?: string } }) {
      const threadId = config.configurable?.thread_id ?? '';
      const messages = threads[threadId];
      return messages
        ? { checkpoint: { channel_values: { messages } } }
        : undefined;
    },
  } as unknown as BaseCheckpointSaver;
}

const user = (name: string | null) =>
  new ServerCallContext({
    user: name
      ? { isAuthenticated: true, userName: name }
      : { isAuthenticated: false, userName: '' },
  });

function task(
  id: string,
  contextId: string,
  state = TaskState.TASK_STATE_COMPLETED,
): Task {
  return {
    id,
    contextId,
    status: {
      state,
      message: undefined,
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    artifacts: [],
    history: [],
    metadata: undefined,
  };
}

let store: InMemoryStore;

beforeEach(() => {
  store = new InMemoryStore();
});

describe('the envelope holds only what the graph cannot know', () => {
  it('never persists the conversation, even when handed one', async () => {
    const checkpointer = stubCheckpointer({ ctx: [new HumanMessage('oi')] });
    const taskStore = new LangChainTaskStore({ store, checkpointer });

    const withHistory: Task = {
      ...task('t1', 'ctx'),
      history: [
        {
          messageId: 'm1',
          contextId: 'ctx',
          taskId: 't1',
          role: Role.ROLE_USER,
          parts: [A2aPart.text('oi')],
          metadata: undefined,
          extensions: [],
          referenceTaskIds: [],
        },
      ],
    };

    await taskStore.save(withHistory, user('u1'));

    const raw = await store.search(['a2a', 'u1', 'tasks', 'ctx']);
    expect(raw).toHaveLength(1);
    expect(JSON.stringify(raw[0].value)).not.toContain('"history"');
  });

  it('round-trips the lifecycle fields', async () => {
    const checkpointer = stubCheckpointer({ ctx: [] });
    const taskStore = new LangChainTaskStore({ store, checkpointer });

    await taskStore.save(
      { ...task('t1', 'ctx', TaskState.TASK_STATE_INPUT_REQUIRED) },
      user('u1'),
    );

    const loaded = await taskStore.load('t1', user('u1'));
    expect(loaded?.id).toBe('t1');
    expect(loaded?.contextId).toBe('ctx');
    expect(loaded?.status?.state).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);
  });

  it('returns undefined for a task it has no envelope for', async () => {
    const checkpointer = stubCheckpointer({ ctx: [new HumanMessage('oi')] });
    const taskStore = new LangChainTaskStore({ store, checkpointer });

    expect(await taskStore.load('nope', user('u1'))).toBeUndefined();
  });
});

describe('the conversation comes from the checkpointer', () => {
  async function turn(
    thread: BaseMessage[],
    produced: BaseMessage[],
    taskId = 't1',
  ) {
    const checkpointer = stubCheckpointer({ ctx: thread });
    const taskStore = new LangChainTaskStore({ store, checkpointer });
    await taskStore.save(task(taskId, 'ctx'), user('u1'));
    thread.push(...produced);
    return taskStore;
  }

  it('projects the graph messages as A2A messages', async () => {
    const taskStore = await turn(
      [],
      [new HumanMessage('qual o prazo?'), new AIMessage('15 dias')],
    );
    const loaded = await taskStore.load('t1', user('u1'));

    expect(loaded?.history.map((m) => m.role)).toEqual([
      Role.ROLE_USER,
      Role.ROLE_AGENT,
    ]);
    expect(
      loaded?.history[1].parts[0].content?.$case === 'text' &&
        loaded.history[1].parts[0].content.value,
    ).toBe('15 dias');
  });

  it('folds a tool result onto the call it answers', async () => {
    const taskStore = await turn(
      [],
      [
        new HumanMessage('busque'),
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'c1', name: 'buscar', args: {} }],
        }),
        new ToolMessage({ tool_call_id: 'c1', content: 'achei' }),
      ],
    );
    const loaded = await taskStore.load('t1', user('u1'));

    expect(loaded?.history).toHaveLength(2);

    const payloads = (loaded?.history[1]?.parts ?? []).map((p) =>
      new ClientToolsExtension().decode(p),
    );
    expect(payloads.find((p) => p?.type === 'tool-call')).toMatchObject({
      toolCallId: 'c1',
    });
    expect(payloads.find((p) => p?.type === 'tool-result')).toMatchObject({
      result: 'achei',
    });
  });

  it('reports a call no ToolMessage answers as having no result', async () => {
    const taskStore = await turn(
      [],
      [
        new HumanMessage('busque'),
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'c1', name: 'buscar', args: {} }],
        }),
      ],
    );
    const loaded = await taskStore.load('t1', user('u1'));

    const payloads = (loaded?.history[1]?.parts ?? []).map((p) =>
      new ClientToolsExtension().decode(p),
    );
    expect(payloads.find((p) => p?.type === 'tool-call')).toBeDefined();
    expect(payloads.find((p) => p?.type === 'tool-result')).toBeUndefined();
  });

  it('drops graph bookkeeping', async () => {
    const taskStore = await turn(
      [],
      [new HumanMessage('oi'), new AIMessage('')],
    );
    const loaded = await taskStore.load('t1', user('u1'));

    expect(loaded?.history).toHaveLength(1);
  });
});

describe('slicing a conversation across its tasks', () => {
  it('gives each task only the segment it produced', async () => {
    const thread: BaseMessage[] = [];
    const checkpointer = stubCheckpointer({ ctx: thread });
    const taskStore = new LangChainTaskStore({ store, checkpointer });

    await taskStore.save(task('t1', 'ctx'), user('u1'));
    thread.push(new HumanMessage('primeira'), new AIMessage('resposta 1'));

    await taskStore.save(task('t2', 'ctx'), user('u1'));
    thread.push(new HumanMessage('segunda'), new AIMessage('resposta 2'));

    const { tasks } = await taskStore.list(
      {
        tenant: '',
        contextId: 'ctx',
        status: TaskState.TASK_STATE_UNSPECIFIED,
        pageToken: '',
        statusTimestampAfter: undefined,
      },
      user('u1'),
    );

    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(tasks[0].history.map((m) => textOf(m.parts))).toEqual([
      'primeira',
      'resposta 1',
    ]);
    expect(tasks[1].history.map((m) => textOf(m.parts))).toEqual([
      'segunda',
      'resposta 2',
    ]);

    const all = tasks.flatMap((t) => t.history.map((m) => m.messageId));
    expect(new Set(all).size).toBe(all.length);
  });

  it('caps history to the most recent N', async () => {
    const thread: BaseMessage[] = [];
    const checkpointer = stubCheckpointer({ ctx: thread });
    const taskStore = new LangChainTaskStore({ store, checkpointer });
    await taskStore.save(task('t1', 'ctx'), user('u1'));
    thread.push(
      new HumanMessage('um'),
      new AIMessage('dois'),
      new HumanMessage('tres'),
    );

    const { tasks } = await taskStore.list(
      {
        tenant: '',
        contextId: 'ctx',
        status: TaskState.TASK_STATE_UNSPECIFIED,
        pageToken: '',
        statusTimestampAfter: undefined,
        historyLength: 1,
      },
      user('u1'),
    );

    expect(tasks[0].history.map((m) => textOf(m.parts))).toEqual(['tres']);
  });
});

describe('scoping', () => {
  it('does not show one caller another caller’s tasks', async () => {
    const checkpointer = stubCheckpointer({ ctx: [new HumanMessage('oi')] });
    const taskStore = new LangChainTaskStore({ store, checkpointer });

    await taskStore.save(task('t1', 'ctx'), user('u1'));

    const { tasks } = await taskStore.list(
      {
        tenant: '',
        contextId: 'ctx',
        status: TaskState.TASK_STATE_UNSPECIFIED,
        pageToken: '',
        statusTimestampAfter: undefined,
      },
      user('u2'),
    );

    expect(tasks).toEqual([]);
    expect(await taskStore.load('t1', user('u2'))).toBeUndefined();
  });

  it('treats an unauthenticated caller as its own scope, not as everyone', async () => {
    const checkpointer = stubCheckpointer({ ctx: [new HumanMessage('oi')] });
    const taskStore = new LangChainTaskStore({ store, checkpointer });

    await taskStore.save(task('t1', 'ctx'), user('u1'));

    expect(await taskStore.load('t1', user(null))).toBeUndefined();
  });
});

function textOf(
  parts: { content?: { $case: string; value: unknown } }[],
): string {
  return parts
    .map((p) => (p.content?.$case === 'text' ? String(p.content.value) : ''))
    .join('');
}
