import type { MikroORM } from '@mikro-orm/postgresql';
import type { Type } from '@nestjs/common';
import type { PostgresOptions } from '@nestposts/database';
import { bootstrap } from './bootstrap';

const otherSchemas = (orm: MikroORM): Promise<string[]> =>
  orm.em
    .getConnection()
    .execute<{ nspname: string }[]>(
      `select nspname from pg_namespace where nspname not like 'pg\\_%' and nspname <> 'information_schema'`,
    )
    .then(rows => rows.map(row => row.nspname))
    .catch(() => []);

export const configFor =
  (module: Type) =>
  async (): Promise<PostgresOptions> => {
    const { app, orm } = await bootstrap(module);
    const schema = orm.config.get('schema');
    const options = orm.config.getAll() as PostgresOptions;
    const entities = orm.config.get('entities');
    const ignoreSchema = (await otherSchemas(orm)).filter(name => name && name !== schema);
    await app.close();

    return { ...options, entities, entitiesTs: entities, schemaGenerator: { ignoreSchema } };
  };
