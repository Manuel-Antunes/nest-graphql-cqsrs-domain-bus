import { defineConfig } from '@mikro-orm/postgresql';
import { z } from 'zod';

export const DEFAULT_POSTGRES_URL =
  'postgresql://nestposts:nestposts@localhost:5432/nestposts';

/**
 * The schema every SYSTEM table is pinned to: Better Auth's and the organizations'. An entity says so
 * itself, `defineEntity({ schema: SYSTEM_SCHEMA })`, so it lives there whatever entity manager asks.
 */
export const SYSTEM_SCHEMA = 'public';

/**
 * The pin of every other table: MikroORM's wildcard. The table exists once per tenant, and which one
 * a query reaches is the schema of the entity manager it runs on — `em.fork({ schema: 'tenant_acme' })`.
 */
export const TENANT_SCHEMA = '*';

/**
 * The schema the messaging's own tables live in: the outbox, its dead letters, the inbox and the
 * event log.
 *
 * They are bookkeeping, not a tenant's data — one outbox for every message this system owes a broker,
 * one inbox for every message it receives, one log for every event it keeps — so they are pinned
 * here, created with the system migrations, and never wait on a tenant's schema to exist. What a row
 * still says about tenancy, the log says in a column: the tenant it was written in.
 */
export const TRANSPORT_SCHEMA = 'transport';

export const DatabaseConfigSchema = z.object({
  clientUrl: z.string().min(1),
  schema: z.string().min(1),
  debug: z.boolean(),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export type PostgresOptions = Parameters<typeof defineConfig>[0];

export const postgresUrl = (): string =>
  process.env.POSTGRES_URL ?? DEFAULT_POSTGRES_URL;

export const databaseConfig = (
  schema: string = SYSTEM_SCHEMA,
  clientUrl: string = postgresUrl(),
): DatabaseConfig =>
  DatabaseConfigSchema.parse({
    clientUrl,
    schema,
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  });

export const postgresDatabase = (
  schema: string = SYSTEM_SCHEMA,
  options: PostgresOptions = {},
): PostgresOptions =>
  defineConfig({
    ...databaseConfig(schema),
    ensureDatabase: { create: false },
    ...options,
  });
