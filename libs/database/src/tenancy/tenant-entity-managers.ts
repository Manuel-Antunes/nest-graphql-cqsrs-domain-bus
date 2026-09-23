import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';

import { TenantSchemas } from './tenant-schemas';

/**
 * **The entity manager a tenant's work runs on.**
 *
 * What is cached is the tenant's *root* manager, never a request's: `RequestContext.create` forks
 * whatever it is handed, so each request still gets a clean identity map and the cache only saves
 * re-deriving the schema binding. Caching the forked one instead would be the bug this shape exists
 * to avoid — one identity map shared by every request of a tenant.
 */
@Injectable()
export class TenantEntityManagers {
  private readonly roots = new Map<string, EntityManager>();

  constructor(
    private readonly orm: MikroORM,
    private readonly schemas: TenantSchemas,
  ) {}

  forTenant(tenantId: string): EntityManager {
    const schema = this.schemas.schemaFor(tenantId);
    if (!schema) {
      return this.orm.em;
    }
    const cached = this.roots.get(schema);
    if (cached) {
      return cached;
    }
    const root = this.orm.em.fork({ schema, clear: true });
    this.roots.set(schema, root);
    return root;
  }
}
