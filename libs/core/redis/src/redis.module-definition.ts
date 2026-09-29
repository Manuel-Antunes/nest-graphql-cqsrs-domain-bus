import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { RedisClientOptions } from '@redis/client';

/** `RedisModule`'s own option: whether it is global, which it is unless told otherwise. */
export interface RedisModuleExtras {
  isGlobal?: boolean;
}

export const {
  ConfigurableModuleClass: ConfigurableRedisModule,
  MODULE_OPTIONS_TOKEN: REDIS_MODULE_OPTIONS,
  OPTIONS_TYPE: REDIS_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: REDIS_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<RedisClientOptions>({ moduleName: 'Redis' })
  .setClassMethodName('forRoot')
  .setExtras<RedisModuleExtras>({ isGlobal: true }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,
  }))
  .build();

/** Exactly node-redis' `RedisClientOptions` — `url`, `socket`, `username`… — plus {@link RedisModuleExtras}. */
export type RedisModuleOptions = typeof REDIS_MODULE_OPTIONS_TYPE;

/** `useFactory`, `useClass` or `useExisting`, plus {@link RedisModuleExtras}. */
export type RedisModuleAsyncOptions = typeof REDIS_MODULE_ASYNC_OPTIONS_TYPE;
