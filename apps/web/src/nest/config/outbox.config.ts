import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { env } from '@/env.mjs';

export const outboxConfig = registerAs('outbox', () => ({
  relay: env.WEB_OUTBOX_RELAY,
  retry: { attempts: env.WEB_OUTBOX_RETRY_ATTEMPTS },
}));

export type OutboxConfig = ConfigType<typeof outboxConfig>;
