import { defineConfig } from '@mikro-orm/postgresql';

import type { DatabaseConfig } from '../config/database.config';
import { databaseConfig } from '../config/database.config';
import { SYSTEM_SCHEMA } from './schemas';

export type PostgresOptions = Parameters<typeof defineConfig>[0];

/**
 * A connection's options: the system schema, the database the configuration names — never created,
 * that is the migrator's — and whatever the caller adds or overrides. `DatabaseModule` builds
 * its connection with this and the configuration it is injected; a spec or a CLI outside Nest calls
 * it with the environment's.
 */
export const postgresDatabase = (
  options: PostgresOptions = {},
  database: DatabaseConfig = databaseConfig(),
): PostgresOptions =>
  defineConfig({
    schema: SYSTEM_SCHEMA,
    ensureDatabase: { create: false },
    ...database,
    ...options,
  });
