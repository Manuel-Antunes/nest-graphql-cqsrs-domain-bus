import { defineConfig } from '@mikro-orm/sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The connection, and nothing about who uses it.
 *
 * This service writes to two tables and two only, and both belong to the framework: its event store and
 * its inbox, which the transport's module declares. The domain's mappings arrive through
 * `DatabaseModule.forFeature` in `app.module.ts` — the DOMAIN needs them to exist, not their rows:
 * rehydrating a Post builds a reference to its author, and a reference is something MikroORM can only
 * make for an entity it knows. Those tables are created and stay empty.
 */
export const mikroOrmConfig = (dbName = process.env.TAGGING_DB ?? 'data/tagging.db') => {
  if (dbName !== ':memory:') {
    mkdirSync(dirname(dbName), { recursive: true });
  }
  return defineConfig({
    dbName,
    ensureDatabase: { create: true },
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  });
};
