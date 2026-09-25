import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { env } from '@/env.mjs';

export const inngestConfig = registerAs('inngest', () => ({
  client: {
    isDev: env.INNGEST_DEV,
    baseUrl: env.INNGEST_BASE_URL,
    eventKey: env.INNGEST_EVENT_KEY,
    signingKey: env.INNGEST_SIGNING_KEY,
  },
}));

export type InngestConfig = ConfigType<typeof inngestConfig>;
