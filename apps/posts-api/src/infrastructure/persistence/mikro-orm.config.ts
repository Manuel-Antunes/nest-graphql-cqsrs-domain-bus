import { join } from 'node:path';
import type { PostgresOptions, TenantMigrations } from '@nestposts/database';
import { DataloaderType } from '@nestposts/database';

/**
 * The connection, and nothing about who uses it: every table reaches the ORM through the module that
 * owns it — `DatabaseModule.forFeature`, in `PostsInfrastructureModule`, `UsersInfrastructureModule`,
 * `IdentityModule` and the transport's own module. It points at the system schema; a tenant's tables
 * are reached through the entity manager `TenancyModule` forks for the request.
 */
export class MikroOrmConfiguration {
  static connection(): PostgresOptions {
    return { dataloader: DataloaderType.ALL };
  }

  static tenantMigrations(): TenantMigrations {
    return {
      path: join(__dirname, 'migrations', 'tenant'),
      glob: '!(*.d).{js,cjs}',
    };
  }
}
