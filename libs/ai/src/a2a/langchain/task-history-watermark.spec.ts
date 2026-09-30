import { type Message, Role, type Task, TaskState } from '@a2a-js/sdk';
import { ServerCallContext } from '@a2a-js/sdk/server';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { InMemoryStore } from '@langchain/langgraph';

import { A2aPart } from '../domain/a2a-part';
import { LangChainTaskStore } from './langchain-task-store';

const USER_MESSAGE_ID = 'u-1';

function stubCheckpointer(threads: Record<string, BaseMessage[]>) {
  return {
    async getTuple(config: { configurable?: { thread_id?: string } }) {
      const messages = threads[config.configurable?.thread_id ?? ''];
      return messages
        ? { checkpoint: { channel_values: { messages } } }
        : undefined;
    },
  } as unknown as BaseCheckpointSaver;
}

const caller = new ServerCallContext({
  user: { isAuthenticated: true, userName: 'u1' },
});

const openingMessage: Message = {
  messageId: USER_MESSAGE_ID,
  contextId: 'c1',
  taskId: 't1',
  role: Role.ROLE_USER,
  parts: [A2aPart.text('analise essa imagem')],
  metadata: undefined,
  extensions: [],
  referenceTaskIds: [],
};

const announcement = (): Task => ({
  id: 't1',
  contextId: 'c1',
  status: {
    state: TaskState.TASK_STATE_WORKING,
    message: undefined,
    timestamp: '2026-01-01T00:00:00.000Z',
  },
  artifacts: [],
  history: [openingMessage],
  metadata: undefined,
});

const settledThread = (): BaseMessage[] => [
  new HumanMessage({ content: 'analise essa imagem', id: USER_MESSAGE_ID }),
  new AIMessage({ content: 'Preciso de mais detalhes.', id: 'a-1' }),
];

async function turnHistory(
  alreadyWritten: BaseMessage[],
): Promise<{ role: string; text: string }[]> {
  const thread: Record<string, BaseMessage[]> = { c1: [...alreadyWritten] };
  const store = new LangChainTaskStore({
    store: new InMemoryStore(),
    checkpointer: stubCheckpointer(thread),
  });

  await store.save(announcement(), caller);

  thread.c1 = settledThread();
  await store.save(announcement(), caller);

  const loaded = await store.load('t1', caller);
  return (loaded?.history ?? []).map((message) => ({
    role: message.role === Role.ROLE_USER ? 'user' : 'agent',
    text: message.parts
      .map((part) => (part.content?.$case === 'text' ? part.content.value : ''))
      .join(''),
  }));
}

describe('a task keeps the message that opened it', () => {
  it('projects the whole turn when the announcement is saved first', async () => {
    await expect(turnHistory([])).resolves.toEqual([
      { role: 'user', text: 'analise essa imagem' },
      { role: 'agent', text: 'Preciso de mais detalhes.' },
    ]);
  });

  it('projects the whole turn when the graph wrote first', async () => {
    await expect(
      turnHistory([
        new HumanMessage({
          content: 'analise essa imagem',
          id: USER_MESSAGE_ID,
        }),
      ]),
    ).resolves.toEqual([
      { role: 'user', text: 'analise essa imagem' },
      { role: 'agent', text: 'Preciso de mais detalhes.' },
    ]);
  });

  it('still starts a later task after the turns before it', async () => {
    const thread: Record<string, BaseMessage[]> = { c1: settledThread() };
    const store = new LangChainTaskStore({
      store: new InMemoryStore(),
      checkpointer: stubCheckpointer(thread),
    });

    await store.save(announcement(), caller);

    const second: Task = {
      ...announcement(),
      id: 't2',
      history: [{ ...openingMessage, messageId: 'u-2', taskId: 't2' }],
    };
    await store.save(second, caller);

    thread.c1 = [
      ...settledThread(),
      new HumanMessage({ content: 'e agora?', id: 'u-2' }),
      new AIMessage({ content: 'Segunda resposta.', id: 'a-2' }),
    ];
    await store.save(second, caller);

    const first = await store.load('t1', caller);
    const later = await store.load('t2', caller);

    expect((first?.history ?? []).map((m) => m.messageId)).toEqual([
      USER_MESSAGE_ID,
      'a-1',
    ]);
    expect((later?.history ?? []).map((m) => m.messageId)).toEqual([
      'u-2',
      'a-2',
    ]);
  });
});
