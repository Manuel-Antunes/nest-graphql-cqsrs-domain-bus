import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AppEnvSchema = z.object({
  NOTIFICATOR_APPLICATION_NAME: z.string().min(1).default('notificator'),
  OTEL_SERVICE_NAME: z.string().min(1).default('notificator'),
  LOG_LEVEL: z.string().min(1).default('info'),
  NOTIFICATOR_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().default(3002),
  NOTIFICATOR_TRANSPORT: z
    .enum(['inngest', 'rabbitmq', 'memory', 'aws'])
    .default('inngest'),
  NOTIFICATOR_EXCHANGE: z.string().min(1).default('nestposts.events'),
  NOTIFICATOR_QUEUE: z
    .string()
    .min(1)
    .default('nestposts.notificator.notification-requests'),
  NOTIFICATOR_RETRY_DELAY_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(5_000),
  NOTIFICATOR_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
});

export const appConfig = registerAs('app', () => {
  const parsed = AppEnvSchema.parse(process.env);
  return {
    name: parsed.NOTIFICATOR_APPLICATION_NAME,
    serviceName: parsed.OTEL_SERVICE_NAME,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.NOTIFICATOR_PORT ?? parsed.PORT,
    transport: parsed.NOTIFICATOR_TRANSPORT,
    exchange: parsed.NOTIFICATOR_EXCHANGE,
    inboundQueue: parsed.NOTIFICATOR_QUEUE,
    retryDelayMs: parsed.NOTIFICATOR_RETRY_DELAY_MS,
    maxRetries: parsed.NOTIFICATOR_MAX_RETRIES,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
