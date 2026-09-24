import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import type { AssetContextData } from '../../domain/context/asset-context-registry';
import { AssetContext } from '../context/asset-context';
import { assetContextFromExecutionContext } from '../context/asset-context-source';

/**
 * Opens an {@link AssetContext} scope for every call on every transport, for the ones a middleware
 * never sees. When a scope is already open (the middleware ran first) it steps aside. The scope
 * stays open for the whole subscription, so the handler's async work sees it.
 */
@Injectable()
export class AssetContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (AssetContext.isActive()) {
      return next.handle();
    }

    const values = this.resolve(context);

    return new Observable((subscriber) => {
      const subscription = AssetContext.run(values, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        }),
      );
      return () => subscription.unsubscribe();
    });
  }

  /** What this call contributes to the scope. Override it to carry more than the tenant. */
  protected resolve(context: ExecutionContext): AssetContextData {
    return assetContextFromExecutionContext(context);
  }
}
