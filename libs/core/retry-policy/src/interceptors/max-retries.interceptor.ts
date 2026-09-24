import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Optional,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import {
  catchError,
  concat,
  defer,
  ignoreElements,
  Observable,
  throwError,
} from 'rxjs';

import { ExceptionProducer } from '../base-exeception-producer';
import {
  EXCEPTION_MAX_RETRIES_KEY,
  EXCEPTION_SKIP_HANDLER_KEY,
  EXCEPTION_SKIP_HANDLER_TOKEN_KEY,
  type SkipHandler,
  type SkipHandlerStrategy,
  type SkipHandlerToken,
} from '../decorators/retry-policy.decorator';
import { RetryPolicyFailure } from './retry-policy.failure';

/**
 * Reads the per-handler `@RetryPolicy` metadata and hands the resolved policy
 * to {@link MaxRetriesFilter} on the error itself. PAIR IT with
 * `@UseFilters(MaxRetriesFilter)` on the same handler.
 *
 * Why split across an interceptor + a filter:
 *  - Only an interceptor gets the `ExecutionContext` (`getHandler()`), so only
 *    it can read the per-handler `@RetryPolicy` metadata + resolve a DI skip
 *    handler strategy.
 *  - Only a METHOD-SCOPED filter can preempt a GLOBAL `@Catch()` filter (e.g.
 *    `SentryGlobalFilter`, which swallows a plain `Error` in the rpc context).
 *    An interceptor's re-thrown error would flow INTO that global filter and be
 *    dropped — silently killing the retry.
 *
 * So the interceptor wraps whatever the handler throws in a {@link
 * RetryPolicyFailure} carrying the policy, and the filter unwraps it and does
 * the transport mapping.
 */
@Injectable()
export class MaxRetriesInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(ModuleRef)
    private readonly moduleRef: ModuleRef,
    @Optional()
    @Inject('MAX_RETRIES')
    private readonly defaultMaxRetries: number = 5,
    @Optional()
    @Inject('EXCEPTION_PRODUCER')
    private readonly exceptionProducer?: ExceptionProducer,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const maxRetries =
      this.reflector.get<number>(EXCEPTION_MAX_RETRIES_KEY, handler) ??
      this.defaultMaxRetries;
    const skipHandler = this.resolveSkipHandler(handler);

    const rpcHost = context.switchToRpc();
    const producer = this.exceptionProducer;
    const handled = producer
      ? concat(
          next.handle(),
          defer(() => producer.acknowledge(rpcHost)).pipe(ignoreElements()),
        )
      : next.handle();

    return handled.pipe(
      catchError((cause: unknown) =>
        throwError(
          () => new RetryPolicyFailure(cause, { maxRetries, skipHandler }),
        ),
      ),
    );
  }

  /**
   * A DI-resolved `skipHandlerToken` (precedence) wins over an inline
   * `skipHandler` closure. The token is resolved lazily, only when a skip
   * actually happens, via `ModuleRef` — so the strategy can inject services.
   */
  private resolveSkipHandler(handler: unknown): SkipHandler | undefined {
    const token = this.reflector.get<SkipHandlerToken>(
      EXCEPTION_SKIP_HANDLER_TOKEN_KEY,
      handler as never,
    );
    if (token) {
      return (host) => {
        const strategy = this.moduleRef.get<SkipHandlerStrategy>(token, {
          strict: false,
        });
        return strategy.handle(host);
      };
    }
    return this.reflector.get<SkipHandler>(
      EXCEPTION_SKIP_HANDLER_KEY,
      handler as never,
    );
  }
}
