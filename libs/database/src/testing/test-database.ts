import type { MikroORM } from '@mikro-orm/core';

/** Any ORM, however its entity list was inferred: a spec hands over whatever Nest gave it. */
export type AnyMikroORM = MikroORM<any, any, any>;
import { MikroORM as PostgresMikroORM } from '@mikro-orm/postgresql';
import { postgresDatabase, type PostgresOptions } from '../config/database.config';

let taken = 0;

/**
 * A schema name no other spec in this run will pick. One Postgres serves the whole suite, so the
 * isolation SQLite gave away for free with `:memory:` is a schema here: created around the spec that
 * asked for it, dropped with everything in it afterwards.
 */
export const testSchema = (prefix = 'spec'): string =>
  `${prefix}_${process.pid.toString(36)}_${Date.now().toString(36)}_${taken++}`;

/** The config for a spec that boots Nest. Pair it with {@link ensureTestSchema} after `module.init()`. */
export const testDatabaseConfig = (options: PostgresOptions = {}, prefix?: string): PostgresOptions =>
  postgresDatabase(testSchema(prefix), options);

/** Creates the schema this ORM was configured with, and everything its entities map. */
export const ensureTestSchema = async (orm: AnyMikroORM): Promise<void> => {
  await orm.schema.ensureDatabase();
  await orm.em.getConnection().execute(`create schema if not exists "${orm.config.get('schema')}"`);
  await orm.schema.create();
};

export const dropTestSchema = async (orm: AnyMikroORM): Promise<void> => {
  const schema = orm.config.get('schema');
  await orm.em.getConnection().execute(`drop schema if exists "${schema}" cascade`);
};

/** An ORM on a schema of its own, with the tables its entities map already there. */
export async function testDatabase(options: PostgresOptions = {}, prefix?: string): Promise<AnyMikroORM> {
  const orm = (await PostgresMikroORM.init(testDatabaseConfig(options, prefix))) as AnyMikroORM;
  await ensureTestSchema(orm);
  return orm;
}

/** The other half of {@link testDatabase}: the schema goes with the connection. */
export async function closeTestDatabase(orm: AnyMikroORM): Promise<void> {
  await dropTestSchema(orm);
  await orm.close(true);
}

/**
 * An ORM that never connects: discovery and nothing else.
 *
 * A `Collection` finds out which property it belongs to by reading its owner's metadata, so a domain
 * spec that calls `post.tags.add(...)` needs an ORM to have seen the entity — and needs no database
 * whatsoever to do it.
 */
export async function metadataOnly(
  entities: NonNullable<PostgresOptions['entities']>,
): Promise<AnyMikroORM> {
  return (await PostgresMikroORM.init(
    postgresDatabase('metadata', { entities, ensureDatabase: false }),
  )) as AnyMikroORM;
}

/**
 * A table name a raw statement can use: qualified with the schema the ORM was configured with.
 *
 * A spec that reads the column behind a mapping — what soft delete actually wrote — has to say where
 * the table is, because native SQL is resolved against the `search_path` and not against the
 * connection's schema.
 */
export const tableIn = (orm: AnyMikroORM, table: string): string => {
  const schema = orm.config.get('schema');
  const platform = orm.em.getPlatform();
  const name = platform.quoteIdentifier(table);
  return schema && schema !== '*' ? `${platform.quoteIdentifier(schema)}.${name}` : name;
};
