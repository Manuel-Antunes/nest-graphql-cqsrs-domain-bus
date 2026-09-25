import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { env } from '@/env.mjs';

export const rabbitmqConfig = registerAs('rabbitmq', () => ({
  urls: [env.RABBITMQ_URL],
}));

export type RabbitmqConfig = ConfigType<typeof rabbitmqConfig>;
