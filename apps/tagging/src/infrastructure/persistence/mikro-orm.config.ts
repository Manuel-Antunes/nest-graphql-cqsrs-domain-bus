import { join } from 'node:path';
import type { TenantMigrations } from '@nestposts/database';
import { postgresDatabase, SYSTEM_SCHEMA } from '@nestposts/database';

import type { PostgresConfig } from '../../config/postgres.config';

/**
 * The connection, and nothing about who uses it.
 *
 * This service writes to two tables and two only, and both belong to the framework: its event store and
 * its inbox, which the transport's module declares — one of each per tenant, in the tenant's schema. The
 * domain's mappings arrive through `DatabaseModule.forFeature` in `app.module.ts` — the DOMAIN needs them
 * to exist, not their rows: rehydrating a Post builds a reference to its author, and a reference is
 * something MikroORM can only make for an entity it knows.
 */
export class MikroOrmConfiguration {
  static connection({ url, debug }: PostgresConfig) {
    return postgresDatabase(SYSTEM_SCHEMA, { clientUrl: url, debug });
  }

  static tenantMigrations(): TenantMigrations {
    return {
      path: join(__dirname, 'migrations', 'tenant'),
      glob: '!(*.d).{js,cjs}',
    };
  }
}
