import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import type { TransportOutboxSettings } from '@nestposts/transport-eventbus';

import { env } from '@/env.mjs';

export const outboxConfig = registerAs(
  'outbox',
  () =>
    ({
      relay: env.WEB_OUTBOX_RELAY,
      retry: { attempts: env.WEB_OUTBOX_RETRY_ATTEMPTS },
    }) satisfies TransportOutboxSettings,
);

export type OutboxConfig = ConfigType<typeof outboxConfig>;
