import type { PostgresOptions } from '@nestposts/database';
import { ROOT_TENANT_SCHEMA, SYSTEM_SCHEMA } from '@nestposts/database';
import { TRANSPORT_SCHEMA } from '@nestposts/transport-eventbus/persistence/transport-schema';

import { bootstrap, liveSchemas } from './app/bootstrap';
import { migrationFiles } from './app/connections';

export default async (): Promise<PostgresOptions> => {
  const { app, orm } = await bootstrap();
  const baseConfig = orm.config.getAll() as PostgresOptions;
  const entities = orm.config.get('entities');
  const schemas = await liveSchemas(orm);
  await app.close();

  const ignoreSchema = Array.from(
    new Set([
      ROOT_TENANT_SCHEMA,
      ...schemas.filter(
        (name) => name && name !== SYSTEM_SCHEMA && name !== TRANSPORT_SCHEMA,
      ),
    ]),
  );

  return {
    ...baseConfig,
    entities,
    entitiesTs: entities,
    schema: SYSTEM_SCHEMA,
    schemaGenerator: { ignoreSchema },
    migrations: migrationFiles('system'),
  };
};
