import type { EventSubscriber } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import { SeedManager, type Seeder } from '@mikro-orm/seeder';
import {
  POSTS_SCHEMA,
  TAGGING_SCHEMA,
  postgresDatabase,
  type PostgresOptions,
} from '@nestposts/database';
import { join } from 'node:path';

export const postsSchema = (): string => process.env.POSTS_SCHEMA ?? POSTS_SCHEMA;

export const taggingSchema = (): string => process.env.TAGGING_SCHEMA ?? TAGGING_SCHEMA;

export type SeederClass = new () => Seeder;

export type MigratedDatabase = {
  schema: string;
  folder: string;
  entities: NonNullable<PostgresOptions['entities']>;
  subscribers?: EventSubscriber[];
  seeders?: SeederClass[];
};

export type MigratedDatabaseConfig = () => Promise<PostgresOptions>;

const liveSchemas = async (): Promise<string[]> => {
  const orm = (await MikroORM.init(
    postgresDatabase('public', { entities: [], discovery: { warnWhenNoEntities: false } }),
  )) as MikroORM;
  try {
    const rows = await orm.em
      .getConnection()
      .execute<{ nspname: string }[]>(
        `select nspname from pg_namespace where nspname not like 'pg\\_%' and nspname <> 'information_schema'`,
      );
    return rows.map(row => row.nspname);
  } finally {
    await orm.close(true);
  }
};

export const migratedDatabase =
  ({ schema, folder, entities, subscribers = [], seeders }: MigratedDatabase): MigratedDatabaseConfig =>
  async () => {
    const others = (await liveSchemas()).filter(name => name && name !== schema);

    return postgresDatabase(schema, {
      entities,
      entitiesTs: entities,
      subscribers,
      preferTs: false,
      extensions: seeders ? [Migrator, SeedManager] : [Migrator],
      schemaGenerator: { ignoreSchema: [...new Set(['public', taggingSchema(), postsSchema(), ...others])].filter(name => name !== schema) },
      migrations: {
        path: join(__dirname, 'migrations', folder),
        pathTs: join(__dirname, '..', 'src', 'migrations', folder),
        glob: '!(*.d).{js,ts,cjs}',
        emit: 'ts',
      },
      ...(seeders
        ? {
            seeder: {
              path: join(__dirname, 'seeders'),
              pathTs: join(__dirname, '..', 'src', 'seeders'),
              seedersList: seeders,
              defaultSeeder: 'DatabaseSeeder',
              emit: 'ts',
            },
          }
        : {}),
    });
  };
