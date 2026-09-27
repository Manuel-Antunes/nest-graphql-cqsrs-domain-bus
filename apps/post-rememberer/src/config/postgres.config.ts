import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { DEFAULT_POSTGRES_URL } from '@nestposts/database';
import { z } from 'zod';

const PostgresEnvSchema = z.object({
  POSTGRES_URL: z.string().min(1).default(DEFAULT_POSTGRES_URL),
  MIKRO_ORM_DEBUG: z.stringbool().default(false),
});

export const postgresConfig = registerAs('postgres', () => {
  const parsed = PostgresEnvSchema.parse(process.env);
  return { url: parsed.POSTGRES_URL, debug: parsed.MIKRO_ORM_DEBUG };
});

export type PostgresConfig = ConfigType<typeof postgresConfig>;
