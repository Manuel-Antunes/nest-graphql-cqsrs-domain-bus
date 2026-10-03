import { join } from 'node:path';
import type { TenantMigrations } from '@nestposts/database';

export class MikroOrmConfiguration {
  static tenantMigrations(): TenantMigrations {
    return {
      path: join(__dirname, 'migrations', 'tenant'),
      glob: '!(*.d).{js,cjs}',
    };
  }
}
