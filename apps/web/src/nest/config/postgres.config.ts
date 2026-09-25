import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { env } from '@/env.mjs';

export const postgresConfig = registerAs('postgres', () => ({
  url: env.POSTGRES_URL,
  debug: env.MIKRO_ORM_DEBUG,
}));

export type PostgresConfig = ConfigType<typeof postgresConfig>;
