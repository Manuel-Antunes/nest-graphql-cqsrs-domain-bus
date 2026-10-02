import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AppEnvSchema = z.object({
  OTEL_SERVICE_NAME: z.string().min(1).default('posts-agent'),
  LOG_LEVEL: z.string().min(1).default('info'),
  POSTS_AGENT_PORT: z.coerce.number().int().nonnegative().default(9000),
  POSTS_AGENT_HOST: z.string().min(1).default('0.0.0.0'),
  POSTS_AGENT_URL: z.url().optional(),
});

export const appConfig = registerAs('app', () => {
  const parsed = AppEnvSchema.parse(process.env);
  return {
    serviceName: parsed.OTEL_SERVICE_NAME,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.POSTS_AGENT_PORT,
    host: parsed.POSTS_AGENT_HOST,
    url: parsed.POSTS_AGENT_URL,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
