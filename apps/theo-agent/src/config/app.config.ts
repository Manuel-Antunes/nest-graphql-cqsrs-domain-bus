import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AppEnvSchema = z.object({
  OTEL_SERVICE_NAME: z.string().min(1).default('theo-agent'),
  LOG_LEVEL: z.string().min(1).default('info'),
  THEO_AGENT_PORT: z.coerce.number().int().nonnegative().default(8080),
  THEO_AGENT_HOST: z.string().min(1).default('0.0.0.0'),
});

export const appConfig = registerAs('app', () => {
  const parsed = AppEnvSchema.parse(process.env);
  return {
    serviceName: parsed.OTEL_SERVICE_NAME,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.THEO_AGENT_PORT,
    host: parsed.THEO_AGENT_HOST,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
