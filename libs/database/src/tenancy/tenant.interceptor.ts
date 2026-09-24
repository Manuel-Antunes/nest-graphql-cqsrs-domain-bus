import { RequestContext } from '@mikro-orm/core';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';

import type { TenantResolver } from './tenant.resolver';
import { TENANT_RESOLVER } from './tenant.resolver';
import { TenantEntityManagerService } from './tenant-entity-manager.service';

/**
 * **The tenant's context for everything that is not an HTTP request.**
 *
 * A message off the broker never passes through {@link TenantMiddleware}, and `allowGlobalContext:
 * false` refuses its first query. This opens the same context it would have had: the tenant the
 * message carries, its schema migrated, its entity manager.
 *
 * It **defers to a context that already exists**, which is what makes running both halves safe: an
 * HTTP request the middleware already scoped is not re-scoped here, so one request is one entity
 * manager and one identity map, not two.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(
    private readonly tenantEntityManagerService: TenantEntityManagerService,
    @Inject(TENANT_RESOLVER) private readonly resolver: TenantResolver,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (RequestContext.currentRequestContext()) {
      return next.handle();
    }

    const tenantId = this.resolver.tenantOf(context);
    this.logger.debug(`${context.getType<string>()} in tenant ${tenantId}`);

    return from(
      this.tenantEntityManagerService.createAndMigrateTenantEntityManager(
        tenantId,
      ),
    ).pipe(
      switchMap(
        (em) =>
          new Observable((subscriber) => {
            const subscription = RequestContext.create(em, () =>
              next.handle().subscribe({
                next: (value) => subscriber.next(value),
                error: (error) => subscriber.error(error),
                complete: () => subscriber.complete(),
              }),
            );
            return () => subscription.unsubscribe();
          }),
      ),
    );
  }
}
