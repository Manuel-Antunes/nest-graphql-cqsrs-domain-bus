import { join } from 'node:path';
import type { TenantMigrations } from '@nestposts/database';
import { postgresDatabase, SYSTEM_SCHEMA } from '@nestposts/database';

/**
 * The connection, and nothing about who uses it.
 *
 * This service writes to two tables and two only, and both belong to the framework: its event store and
 * its inbox, which the transport's module declares — one of each per tenant, in the tenant's schema. The
 * domain's mappings arrive through `DatabaseModule.forFeature` in `app.module.ts` — the DOMAIN needs them
 * to exist, not their rows: rehydrating a Post builds a reference to its author, and a reference is
 * something MikroORM can only make for an entity it knows.
 */
export const mikroOrmConfig = () => postgresDatabase(SYSTEM_SCHEMA);

/** The tenant migrations the build puts beside this bundle, which a tenant's first message runs. */
export const tenantMigrations = (): TenantMigrations => ({
  path: join(__dirname, 'migrations', 'tenant'),
  glob: '!(*.d).{js,cjs}',
});
