import { defineConfig } from '@mikro-orm/postgresql';
import { z } from 'zod';

export const DEFAULT_POSTGRES_URL = 'postgresql://nestposts:nestposts@localhost:5432/nestposts';

export const POSTS_SCHEMA = 'posts';

export const TAGGING_SCHEMA = 'tagging';

export const DatabaseConfigSchema = z.object({
  clientUrl: z.string().min(1),
  schema: z.string().min(1),
  debug: z.boolean(),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export type PostgresOptions = Parameters<typeof defineConfig>[0];

export const postgresUrl = (): string => process.env.POSTGRES_URL ?? DEFAULT_POSTGRES_URL;

export const databaseConfig = (schema: string, clientUrl: string = postgresUrl()): DatabaseConfig =>
  DatabaseConfigSchema.parse({ clientUrl, schema, debug: process.env.MIKRO_ORM_DEBUG === 'true' });

export const postgresDatabase = (schema: string, options: PostgresOptions = {}): PostgresOptions =>
  defineConfig({
    ...databaseConfig(schema),
    ensureDatabase: { create: false },
    ...options,
  });
