import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import type { AttachmentContextData } from '../../domain/context/attachment-context-registry';
import { AttachmentContext } from './attachment-context';
import { AttachmentContextSource } from './attachment-context-source';

/**
 * Opens an {@link AttachmentContext} scope for every call on every transport, for the ones a
 * middleware never sees. When a scope is already open (the middleware ran first) it steps aside.
 * The scope stays open for the whole subscription, so the handler's async work sees it.
 */
@Injectable()
export class AttachmentContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (AttachmentContext.isActive()) {
      return next.handle();
    }

    const values = this.resolve(context);

    return new Observable((subscriber) => {
      const subscription = AttachmentContext.run(values, () =>
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
  protected resolve(context: ExecutionContext): AttachmentContextData {
    return AttachmentContextSource.fromExecutionContext(context);
  }
}
