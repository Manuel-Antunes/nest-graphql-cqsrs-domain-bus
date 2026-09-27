import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AppEnvSchema = z.object({
  TAGGING_APPLICATION_NAME: z.string().min(1).default('tagging'),
  OTEL_SERVICE_NAME: z.string().min(1).default('tagging'),
  LOG_LEVEL: z.string().min(1).default('info'),
  TAGGING_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  TAGGING_TRANSPORT: z
    .enum(['inngest', 'rabbitmq', 'memory', 'aws'])
    .default('inngest'),
  TAGGING_PUBLISH_EVENTS: z.stringbool().default(true),
  TAGGING_EXCHANGE: z.string().min(1).default('nestposts.events'),
  TAGGING_QUEUE: z.string().min(1).default('nestposts.tagging.post-events'),
  TAGGING_RETRY_DELAY_MS: z.coerce.number().int().nonnegative().default(5_000),
  TAGGING_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
});

export const appConfig = registerAs('app', () => {
  const parsed = AppEnvSchema.parse(process.env);
  return {
    name: parsed.TAGGING_APPLICATION_NAME,
    serviceName: parsed.OTEL_SERVICE_NAME,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.TAGGING_PORT ?? parsed.PORT,
    transport: parsed.TAGGING_TRANSPORT,
    publishes: parsed.TAGGING_PUBLISH_EVENTS,
    exchange: parsed.TAGGING_EXCHANGE,
    inboundQueue: parsed.TAGGING_QUEUE,
    retryDelayMs: parsed.TAGGING_RETRY_DELAY_MS,
    maxRetries: parsed.TAGGING_MAX_RETRIES,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
