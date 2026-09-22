import { TAGGING_SCHEMA, postgresDatabase } from '@nestposts/database';

/**
 * The connection, and nothing about who uses it.
 *
 * This service writes to two tables and two only, and both belong to the framework: its event store and
 * its inbox, which the transport's module declares. The domain's mappings arrive through
 * `DatabaseModule.forFeature` in `app.module.ts` — the DOMAIN needs them to exist, not their rows:
 * rehydrating a Post builds a reference to its author, and a reference is something MikroORM can only
 * make for an entity it knows. Those tables are created and stay empty.
 */
export const mikroOrmConfig = (schema = process.env.TAGGING_SCHEMA ?? TAGGING_SCHEMA) =>
  postgresDatabase(schema);
