import { RequestContext } from '@mikro-orm/core';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';

import type { TenantResolver } from './tenant.resolver';
import { TENANT_RESOLVER } from './tenant.resolver';
import { TenantEntityManagers } from './tenant-entity-managers';

/**
 * **The tenant's context for everything that is not an Express request.**
 *
 * A message off the broker and a field resolved inside a WebSocket subscription never pass through
 * {@link TenantMiddleware}, and `allowGlobalContext: false` refuses their first query. This opens the
 * same context they would have had, on the entity manager the tenant names.
 *
 * It **defers to a context that already exists**, which is what makes running both halves safe: an
 * HTTP request the middleware already scoped is not re-scoped here, so one request is one entity
 * manager and one identity map, not two.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(
    private readonly tenants: TenantEntityManagers,
    @Inject(TENANT_RESOLVER) private readonly resolver: TenantResolver,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (RequestContext.currentRequestContext()) {
      return next.handle();
    }

    const tenantId = this.resolver.tenantOf(context);
    this.logger.debug(`${context.getType<string>()} in tenant ${tenantId}`);

    return new Observable((subscriber) => {
      const subscription = RequestContext.create(
        this.tenants.forTenant(tenantId),
        () =>
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (error) => subscriber.error(error),
            complete: () => subscriber.complete(),
          }),
      );
      return () => subscription.unsubscribe();
    });
  }
}
