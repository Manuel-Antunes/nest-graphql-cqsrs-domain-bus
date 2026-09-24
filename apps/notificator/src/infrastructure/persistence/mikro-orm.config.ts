import { join } from 'node:path';
import type { TenantMigrations } from '@nestposts/database';
import { postgresDatabase, SYSTEM_SCHEMA } from '@nestposts/database';

export const mikroOrmConfig = () => postgresDatabase(SYSTEM_SCHEMA);

export const tenantMigrations = (): TenantMigrations => ({
  path: join(__dirname, 'migrations', 'tenant'),
  glob: '!(*.d).{js,cjs}',
});
