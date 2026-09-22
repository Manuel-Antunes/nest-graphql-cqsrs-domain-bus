import { RequestContext } from '@mikro-orm/core';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { TENANT_HEADER, Tenant } from './tenant';
import { TenantEntityManagers } from './tenant-entity-managers';

interface TenantRequest {
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * **The tenant's context, opened for every HTTP request** — including the one Apollo is about to
 * answer, because GraphQL is served over the same Express pipeline.
 *
 * Middleware and not only the interceptor: middleware runs before the guards, so everything after it
 * — a guard reading the session, a pipe loading an aggregate, the resolver itself — is already inside
 * the right entity manager. {@link TenantInterceptor} is the other half, for what never passes
 * through Express: a WebSocket subscription and a message off the broker.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantEntityManagers) {}

  use(request: TenantRequest, _response: unknown, next: (error?: unknown) => void): void {
    const tenantId = Tenant.normalize(request.headers?.[TENANT_HEADER]);
    RequestContext.create(this.tenants.forTenant(tenantId), next);
  }
}
