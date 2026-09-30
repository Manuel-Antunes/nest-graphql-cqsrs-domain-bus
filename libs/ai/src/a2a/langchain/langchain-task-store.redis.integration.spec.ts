import { type Task, TaskState } from '@a2a-js/sdk';
import { ServerCallContext } from '@a2a-js/sdk/server';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';
import { RedisStore } from '@langchain/langgraph-checkpoint-redis/store';
import { ThrowawayRedis } from '@nestposts/redis/testing/throwaway-redis';
import { createClient } from 'redis';

import { LangChainTaskStore } from './langchain-task-store';

let redis: ThrowawayRedis;
let client: ReturnType<typeof createClient>;
let store: BaseStore;

beforeAll(async () => {
  redis = await ThrowawayRedis.start('redis:8');
  client = createClient({ url: redis.url });
  await client.connect();
  const redisStore = new RedisStore(client as never);
  await redisStore.setup();
  store = redisStore as unknown as BaseStore;
}, 120_000);

afterAll(async () => {
  await client?.quit().catch(() => undefined);
  await redis?.stop();
});

function stubCheckpointer(messages: Record<string, unknown[]>) {
  return {
    async getTuple(config: { configurable?: { thread_id?: string } }) {
      const thread = config.configurable?.thread_id ?? '';
      return messages[thread]
        ? { checkpoint: { channel_values: { messages: messages[thread] } } }
        : undefined;
    },
  } as unknown as BaseCheckpointSaver;
}

const user = (name: string) =>
  new ServerCallContext({
    user: { isAuthenticated: true, userName: name },
  });

function task(id: string, contextId: string): Task {
  return {
    id,
    contextId,
    status: {
      state: TaskState.TASK_STATE_COMPLETED,
      message: undefined,
      timestamp: new Date().toISOString(),
    },
    artifacts: [],
    history: [],
    metadata: undefined,
  };
}

const list = (taskStore: LangChainTaskStore, contextId: string, who: string) =>
  taskStore.list(
    {
      tenant: '',
      contextId,
      status: TaskState.TASK_STATE_UNSPECIFIED,
      pageToken: '',
      statusTimestampAfter: undefined,
    },
    user(who),
  );

describe.runIf(process.env.SKIP_REDIS_TESTS !== '1')(
  'LangChainTaskStore on real Redis',
  () => {
    it('scopes a listing to one conversation even when namespaces tokenize alike', async () => {
      const prefix = `it-${Date.now()}`;
      const ctxA = `${prefix}-ctx-A`;
      const ctxB = `${prefix}-ctx-B`;

      const taskStore = new LangChainTaskStore({
        store,
        checkpointer: stubCheckpointer({
          [ctxA]: [new HumanMessage('a'), new AIMessage('resposta A')],
          [ctxB]: [new HumanMessage('b'), new AIMessage('resposta B')],
        }),
      });

      await taskStore.save(task(`${prefix}-t1`, ctxA), user(prefix));
      await taskStore.save(task(`${prefix}-t2`, ctxB), user(prefix));

      const { tasks } = await list(taskStore, ctxA, prefix);

      expect(tasks.map((t) => t.contextId)).toEqual([ctxA]);
    }, 30_000);

    it('does not show one caller another caller’s tasks', async () => {
      const prefix = `it-${Date.now()}`;
      const ctx = `${prefix}-shared`;

      const taskStore = new LangChainTaskStore({
        store,
        checkpointer: stubCheckpointer({ [ctx]: [new HumanMessage('oi')] }),
      });

      await taskStore.save(task(`${prefix}-owned`, ctx), user(`${prefix}-A`));

      const { tasks } = await list(taskStore, ctx, `${prefix}-B`);
      expect(tasks).toEqual([]);
      expect(
        await taskStore.load(`${prefix}-owned`, user(`${prefix}-B`)),
      ).toBeUndefined();
    }, 30_000);

    it('round-trips a task through the real store', async () => {
      const prefix = `it-${Date.now()}`;
      const ctx = `${prefix}-ctx`;
      const thread: unknown[] = [];

      const taskStore = new LangChainTaskStore({
        store,
        checkpointer: stubCheckpointer({ [ctx]: thread }),
      });

      await taskStore.save(task(`${prefix}-t1`, ctx), user(prefix));
      thread.push(new HumanMessage('pergunta'), new AIMessage('resposta'));

      const loaded = await taskStore.load(`${prefix}-t1`, user(prefix));

      expect(loaded?.contextId).toBe(ctx);
      expect(loaded?.history).toHaveLength(2);
      const raw = await store.search(['a2a', prefix, 'tasks', ctx]);
      expect(JSON.stringify(raw[0]?.value)).not.toContain('"history"');
    }, 30_000);
  },
);
