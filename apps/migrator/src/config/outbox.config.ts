import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const OutboxEnvSchema = z.object({
  INBOX_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

export const outboxConfig = registerAs('outbox', () => {
  const parsed = OutboxEnvSchema.parse(process.env);
  return { inboxRetentionDays: parsed.INBOX_RETENTION_DAYS };
});

export type OutboxConfig = ConfigType<typeof outboxConfig>;
