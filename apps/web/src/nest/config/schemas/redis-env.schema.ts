import { z } from 'zod';

export const RedisEnvSchema = z.object({
  REDIS_URL: z.string().optional(),
});
