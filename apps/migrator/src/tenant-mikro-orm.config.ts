import type { EntityMetadata, EntitySchema } from '@mikro-orm/core';
import type { PostgresOptions } from '@nestposts/database';
import {
  ROOT_TENANT_SCHEMA,
  SYSTEM_SCHEMA,
  TENANT_SCHEMA,
} from '@nestposts/database';
import { TRANSPORT_SCHEMA } from '@nestposts/transport-eventbus/persistence/transport-schema';

import { bootstrap, liveSchemas } from './app/bootstrap';
import { migrationFiles } from './app/connections';
import { TenantMigrationGenerator } from './generators/tenant-migration.generator';

const TENANT_TEMPLATE_SCHEMA = ROOT_TENANT_SCHEMA;

const metadataOf = (entity: unknown): EntitySchema['meta'] | undefined =>
  (entity as EntitySchema).meta;

export default async (): Promise<PostgresOptions> => {
  const { app, orm } = await bootstrap();
  const baseConfig = orm.config.getAll() as PostgresOptions;
  const entities = orm.config.get('entities');
  const schemas = await liveSchemas(orm);
  await app.close();

  const ignoreSchema = Array.from(
    new Set([
      SYSTEM_SCHEMA,
      TRANSPORT_SCHEMA,
      ...schemas.filter((name) => name && name !== TENANT_TEMPLATE_SCHEMA),
    ]),
  );

  const systemEntities = entities.filter((entity) => {
    const schema = metadataOf(entity)?.schema;
    return Boolean(schema) && schema !== TENANT_SCHEMA;
  }) as EntitySchema[];

  const skipTables = systemEntities
    .map((entity) => entity.meta.tableName)
    .filter(Boolean);

  return {
    ...baseConfig,
    entities,
    entitiesTs: entities,
    schema: TENANT_TEMPLATE_SCHEMA,
    discovery: {
      ...baseConfig.discovery,
      onMetadata: (meta: EntityMetadata) => {
        if (meta.schema === TENANT_SCHEMA) {
          meta.schema = TENANT_TEMPLATE_SCHEMA;
        }
      },
    },
    schemaGenerator: { ignoreSchema, skipTables },
    migrations: {
      ...migrationFiles('tenant'),
      generator: TenantMigrationGenerator(systemEntities),
    },
  };
};
