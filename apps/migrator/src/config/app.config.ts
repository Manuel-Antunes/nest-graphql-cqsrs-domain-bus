import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AppEnvSchema = z.object({
  OTEL_SERVICE_NAME: z.string().min(1).default('migrator'),
});

export const appConfig = registerAs('app', () => {
  const parsed = AppEnvSchema.parse(process.env);
  return { serviceName: parsed.OTEL_SERVICE_NAME };
});

export type AppConfig = ConfigType<typeof appConfig>;
