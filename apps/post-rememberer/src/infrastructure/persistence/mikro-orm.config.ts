import { join } from 'node:path';
import type { TenantMigrations } from '@nestposts/database';

/**
 * This service writes to two tables and two only, and both belong to the framework: its event store and
 * its inbox, which the transport's module declares — one of each per tenant, in the tenant's schema. The
 * domain's mappings arrive through `DatabaseModule.forFeature` in `app.module.ts` — the DOMAIN needs them
 * to exist, not their rows: rehydrating a Post builds a reference to its author, and a reference is
 * something MikroORM can only make for an entity it knows.
 */
export class MikroOrmConfiguration {
  static tenantMigrations(): TenantMigrations {
    return {
      path: join(__dirname, 'migrations', 'tenant'),
      glob: '!(*.d).{js,cjs}',
    };
  }
}
