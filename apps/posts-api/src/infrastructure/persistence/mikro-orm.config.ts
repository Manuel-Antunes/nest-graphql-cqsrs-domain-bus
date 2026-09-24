import { join } from 'node:path';
import type { TenantMigrations } from '@nestposts/database';
import {
  DataloaderType,
  postgresDatabase,
  SYSTEM_SCHEMA,
} from '@nestposts/database';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';

/**
 * The connection, and nothing about who uses it: every table reaches the ORM through the module that
 * owns it — `DatabaseModule.forFeature`, in `PostsInfrastructureModule`, `UsersInfrastructureModule`,
 * `IdentityModule` and the transport's own module. It points at the system schema; a tenant's tables
 * are reached through the entity manager `TenancyModule` forks for the request.
 */
export const mikroOrmConfig = () =>
  postgresDatabase(SYSTEM_SCHEMA, {
    subscribers: [new SoftDeleteSubscriber()],
    dataloader: DataloaderType.ALL,
  });

/** The tenant migrations the build puts beside this bundle, which a tenant's first request runs. */
export const tenantMigrations = (): TenantMigrations => ({
  path: join(__dirname, 'migrations', 'tenant'),
  glob: '!(*.d).{js,cjs}',
});
