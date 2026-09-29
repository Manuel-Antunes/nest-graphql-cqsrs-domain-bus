import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { env } from '@/env.mjs';

export const redisConfig = registerAs('redis', () => ({
  url: env.REDIS_URL,
}));

export type RedisConfig = ConfigType<typeof redisConfig>;
