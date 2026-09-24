import type { MigrationsOptions } from '@mikro-orm/core';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { Tenant } from './tenant';

/**
 * Where a tenant's migrations are read from, as MikroORM's own `migrations` option: a `path` of
 * compiled files beside the bundle — `join(__dirname, 'migrations', 'tenant')` — or a
 * `migrationsList` of classes, for a runtime that has no directory to read.
 */
export const TENANT_MIGRATIONS = 'TENANT_MIGRATIONS';

export type TenantMigrations = MigrationsOptions;

/**
 * **The entity manager a tenant's work runs on, with the tenant's schema migrated first.**
 *
 * Every tenant table is pinned to MikroORM's wildcard schema (`*`), so the same metadata serves every
 * tenant and the schema a query reaches is the one the entity manager was forked for. What this adds
 * is the schema itself: the first request of a tenant in this process runs the tenant migrations
 * against `tenant_<name>`, on a connection of its own, and the entity manager is remembered — so the
 * process never asks again while it is up.
 *
 * What is remembered is the tenant's ROOT manager, never a request's: `RequestContext.create` forks
 * whatever it is handed, so each request still gets a clean identity map.
 *
 * A tenant whose schema does not exist is NOT migrated here. The schema is created with its
 * organization (the trigger on the organization row, and {@link provision} from the plugin's hook), so
 * a schema that is not there is a tenant that does not exist — and migrating on the say-so of a
 * header would let any caller create schemas by naming them. Its queries fail honestly instead. The
 * root tenant is the exception: it is everybody's, and the migrator makes it on every deploy.
 */
@Injectable()
export class TenantEntityManagerService {
  private readonly logger = new Logger(TenantEntityManagerService.name);
  private readonly instanceMap = new Map<string, Promise<EntityManager>>();

  constructor(
    private readonly orm: MikroORM,
    @Inject(TENANT_MIGRATIONS) private readonly migrations: TenantMigrations,
  ) {}

  /** The tenant's entity manager, its schema migrated the first time this process meets it. */
  async createAndMigrateTenantEntityManager(
    tenantId: string,
  ): Promise<EntityManager> {
    const schema = this.getTenantSchema(tenantId);
    const found = this.instanceMap.get(schema);
    if (found) {
      return found;
    }
    if (!Tenant.isRoot(Tenant.normalize(tenantId))) {
      if (!(await this.schemaExists(schema))) {
        return this.fork(schema);
      }
    }
    return this.remember(schema);
  }

  /**
   * Creates and migrates a tenant's schema now, whether or not a request has named it — what a new
   * organization is given, so its first request finds its tables already there.
   */
  async provision(tenantId: string): Promise<void> {
    const schema = this.getTenantSchema(tenantId);
    this.instanceMap.delete(schema);
    await this.remember(schema);
  }

  getTenantSchema(tenantId: string): string {
    return Tenant.schemaOf(tenantId);
  }

  private remember(schema: string): Promise<EntityManager> {
    const em = this.migrateSchema(schema).then(() => this.fork(schema));
    this.instanceMap.set(schema, em);
    em.catch(() => this.instanceMap.delete(schema));
    return em;
  }

  private fork(schema: string): EntityManager {
    return this.orm.em.fork({ schema, clear: true });
  }

  private async schemaExists(schema: string): Promise<boolean> {
    const rows = await this.orm.em
      .fork()
      .getConnection()
      .execute<{ found: number }[]>(
        'select 1 as found from pg_namespace where nspname = ?',
        [schema],
      );
    return rows.length > 0;
  }

  /**
   * The tenant migrations, run against one schema on a connection of their own — the tracking table
   * included, which lives in that schema too.
   *
   * Two processes meeting a new tenant at once would run the same `create table` twice, so the run is
   * serialised by a transaction-level advisory lock on the schema's name: the second one waits, then
   * finds nothing pending.
   *
   * No snapshot: after migrating, MikroORM would introspect the whole database to write one beside the
   * migrations — a file nobody reads, into a bundle's directory, at the cost of a full catalogue scan
   * on a tenant's first request.
   */
  private async migrateSchema(schema: string): Promise<void> {
    this.logger.log(`Migrating schema ${schema}`);
    const options = this.orm.config.getAll();
    const migrationConnection = await MikroORM.init({
      ...options,
      extensions: [...new Set([...(options.extensions ?? []), Migrator])],
      migrations: {
        ...options.migrations,
        ...this.migrations,
        snapshot: false,
      },
      schema,
      allowGlobalContext: true,
      debug: false,
    });
    try {
      await migrationConnection.em.fork().transactional(async (em) => {
        await em
          .getConnection()
          .execute(
            'select pg_advisory_xact_lock(hashtext(?))',
            [schema],
            'all',
            em.getTransactionContext(),
          );
        await migrationConnection.migrator.up();
      });
    } finally {
      await migrationConnection.close(true);
    }
  }
}
