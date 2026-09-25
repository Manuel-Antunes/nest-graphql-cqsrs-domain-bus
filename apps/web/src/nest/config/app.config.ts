import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { env } from '@/env.mjs';

export const appConfig = registerAs('app', () => ({
  name: env.WEB_APPLICATION_NAME,
  url: env.WEB_URL,
  transport: env.WEB_TRANSPORT,
  publishes: env.WEB_PUBLISH_EVENTS,
  exchange: env.WEB_EXCHANGE,
}));

export type AppConfig = ConfigType<typeof appConfig>;
