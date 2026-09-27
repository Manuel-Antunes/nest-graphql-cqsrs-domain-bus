import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const OutboxEnvSchema = z.object({
  TAGGING_OUTBOX_RELAY: z.enum(['poll', 'drain', 'off']).default('poll'),
  TAGGING_OUTBOX_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_000),
  TAGGING_OUTBOX_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(20),
  TAGGING_INBOX_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

export const outboxConfig = registerAs('outbox', () => {
  const parsed = OutboxEnvSchema.parse(process.env);
  return {
    relay: parsed.TAGGING_OUTBOX_RELAY,
    pollInterval: parsed.TAGGING_OUTBOX_POLL_INTERVAL_MS,
    retry: { attempts: parsed.TAGGING_OUTBOX_RETRY_ATTEMPTS },
    inboxRetention: `${parsed.TAGGING_INBOX_RETENTION_DAYS}d` as const,
  };
});

export type OutboxConfig = ConfigType<typeof outboxConfig>;
