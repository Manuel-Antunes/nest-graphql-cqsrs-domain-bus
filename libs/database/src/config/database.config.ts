import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { DatabaseEnvSchema } from './database-env.schema';

export const databaseConfig = registerAs('database', () => {
  const env = DatabaseEnvSchema.parse(process.env);
  return { clientUrl: env.POSTGRES_URL, debug: env.MIKRO_ORM_DEBUG };
});

export type DatabaseConfig = ConfigType<typeof databaseConfig>;
