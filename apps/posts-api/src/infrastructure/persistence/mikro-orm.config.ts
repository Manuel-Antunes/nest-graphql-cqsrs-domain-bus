import { join } from 'node:path';
import type { TenantMigrations } from '@nestposts/database';
import {
  DataloaderType,
  postgresDatabase,
  SYSTEM_SCHEMA,
} from '@nestposts/database';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';

import type { PostgresConfig } from '../../config/postgres.config';

/**
 * The connection, and nothing about who uses it: every table reaches the ORM through the module that
 * owns it — `DatabaseModule.forFeature`, in `PostsInfrastructureModule`, `UsersInfrastructureModule`,
 * `IdentityModule` and the transport's own module. It points at the system schema; a tenant's tables
 * are reached through the entity manager `TenancyModule` forks for the request.
 */
export class MikroOrmConfiguration {
  static connection({ url, debug }: PostgresConfig) {
    return postgresDatabase(SYSTEM_SCHEMA, {
      clientUrl: url,
      debug,
      subscribers: [new SoftDeleteSubscriber()],
      dataloader: DataloaderType.ALL,
    });
  }

  static tenantMigrations(): TenantMigrations {
    return {
      path: join(__dirname, 'migrations', 'tenant'),
      glob: '!(*.d).{js,cjs}',
    };
  }
}
