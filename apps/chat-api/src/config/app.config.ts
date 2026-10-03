import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AppEnvSchema = z.object({
  OTEL_SERVICE_NAME: z.string().min(1).default('chat-api'),
  LOG_LEVEL: z.string().min(1).default('info'),
  CHAT_API_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().default(3003),
});

export const appConfig = registerAs('app', () => {
  const parsed = AppEnvSchema.parse(process.env);
  return {
    serviceName: parsed.OTEL_SERVICE_NAME,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.CHAT_API_PORT ?? parsed.PORT,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
