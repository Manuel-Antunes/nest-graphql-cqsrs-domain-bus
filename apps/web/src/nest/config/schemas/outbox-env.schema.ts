import { z } from 'zod';

export const OutboxEnvSchema = z.object({
  WEB_OUTBOX_RELAY: z.enum(['poll', 'drain', 'off']).default('drain'),
  WEB_OUTBOX_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(20),
});
