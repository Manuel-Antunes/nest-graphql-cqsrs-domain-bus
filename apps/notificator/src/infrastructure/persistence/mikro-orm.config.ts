import { join } from 'node:path';
import type { TenantMigrations } from '@nestposts/database';
import { postgresDatabase, SYSTEM_SCHEMA } from '@nestposts/database';

import type { PostgresConfig } from '../../config/postgres.config';

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
