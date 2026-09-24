import type { EntityManager } from '@mikro-orm/core';
import { RequestContext } from '@mikro-orm/core';
import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import { TENANT_HEADER, Tenant } from './tenant';
import { TenantEntityManagerService } from './tenant-entity-manager.service';

interface TenantRequest {
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * **The tenant's context, opened for every HTTP request** — including the one GraphQL is about to
 * answer, because it is served over the same HTTP pipeline.
 *
 * Middleware and not only the interceptor: middleware runs before the guards, so everything after it
 * — a guard reading the session, a pipe loading an aggregate, the resolver itself — is already inside
 * the tenant's entity manager, and the tenant's schema is already migrated. {@link TenantInterceptor}
 * is the other half, for what never passes through here: a message off the broker.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantEntityManagerService: TenantEntityManagerService,
  ) {}

  async use(
    req: TenantRequest,
    _res: unknown,
    next: (error?: unknown) => void,
  ): Promise<void> {
    const tenantId = this.getTenantId(req);
    let em: EntityManager;
    try {
      em =
        await this.tenantEntityManagerService.createAndMigrateTenantEntityManager(
          tenantId,
        );
    } catch (error) {
      next(error);
      return;
    }
    RequestContext.create(em, next);
  }

  private getTenantId(req: TenantRequest): string {
    return Tenant.normalize(req.headers?.[TENANT_HEADER]);
  }
}
