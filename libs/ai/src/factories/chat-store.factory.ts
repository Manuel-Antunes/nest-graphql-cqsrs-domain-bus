import { RedisStore } from '@langchain/langgraph-checkpoint-redis/store';
import { FactoryProvider } from '@nestjs/common';
import type { RedisClientType } from 'redis';

export const ChatStoreFactory = {
  provide: 'CHAT_STORE',
  // Shares the same `REDIS_CLIENT` as the checkpointer.
  // `setup()` after construction creates the RediSearch indexes that
  // `RedisStore.fromConnString` would have built for us.
  async useFactory(redis: RedisClientType) {
    const store = new RedisStore(redis);
    await store.setup();
    return store;
  },
  inject: ['REDIS_CLIENT'],
} satisfies FactoryProvider;
