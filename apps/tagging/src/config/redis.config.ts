import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const RedisEnvSchema = z.object({
  REDIS_URL: z.string().optional(),
});

export const redisConfig = registerAs('redis', () => {
  const parsed = RedisEnvSchema.parse(process.env);
  return { url: parsed.REDIS_URL || undefined };
});

export type RedisConfig = ConfigType<typeof redisConfig>;
