import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { RpcArgumentsHost } from '@nestjs/common/internal';
import { catchError, from, throwError } from 'rxjs';

import { ExceptionProducer } from '../base-exeception-producer';
import type { ResolvedRetryPolicy } from './retry-policy.failure';
import { RetryPolicyFailure } from './retry-policy.failure';

/**
 * Method-scoped exception filter that applies the retry/skip policy the
 * {@link MaxRetriesInterceptor} wrapped the error with ({@link RetryPolicyFailure}). Apply BOTH on the handler:
 * `@UseInterceptors(MaxRetriesInterceptor)` + `@UseFilters(MaxRetriesFilter)`
 * (the `@RetryPolicy` decorator wires both for you).
 *
 * Being method-scoped, NestJS picks this filter BEFORE any global `@Catch()`
 * filter (the first matching filter handles the exception and stops the chain).
 * That's the whole point: a global filter like `SentryGlobalFilter` SWALLOWS a
 * plain `Error` in the rpc context (`return`s instead of rethrowing), which
 * would turn a retry into a silent ack/drop. Handling it here keeps the
 * error→transport contract intact.
 *
 * Because this filter PREEMPTS the global Sentry filter, it is ALSO the only
 * place a retry handler's failure can be reported — so it owns the Sentry
 * capture for those handlers (see {@link settle}).
 *
 * The filter's return IS the handler result for a microservice:
 *  - a completing value ⇒ the record is ACKed (skip / non-retriable / drop).
 *  - an erroring observable ⇒ the record fails ⇒ the transport redelivers.
 * So we return `produceException(...)` as an observable: it RESOLVES on skip and
 * REJECTS (→ re-emitted as an error here) on retry.
 */
@Catch()
@Injectable()
export class MaxRetriesFilter implements ExceptionFilter {
  constructor(
    @Inject('EXCEPTION_PRODUCER')
    private readonly exceptionProducer: ExceptionProducer,
    @Optional()
    @Inject('MAX_RETRIES')
    private readonly defaultMaxRetries: number = 5,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const rpcHost = host.switchToRpc();
    const { cause, policy } =
      exception instanceof RetryPolicyFailure
        ? exception
        : {
            cause: exception,
            policy: { maxRetries: this.defaultMaxRetries },
          };

    return from(this.settle(cause, rpcHost, policy)).pipe(
      // Retry path: `produceException` threw its transport "redeliver" signal —
      // re-emit as an error so the strategy fails the record (transport retries).
      catchError((produceErr) => throwError(() => produceErr)),
    );
  }

  /**
   * Reports the failure to Sentry on EVERY attempt, then runs the retry/skip
   * decision, then drains the transport before the Lambda freezes.
   *
   * Why capture on every attempt (not just the terminal give-up): Sentry groups
   * repeats of the same error into ONE issue, so this is not noise — it's what
   * makes a failure VISIBLE immediately. A "terminal only" capture surfaced
   * nothing in practice: these queues use a long visibility timeout (e.g. the
   * Legal queue's 1800s) and often have no DLQ, so reaching `maxRetries`
   * deliveries can take HOURS (1800s × 5 ≈ 2.5h) — the error sat invisible the
   * whole time, and a deterministic failure with no DLQ loops indefinitely.
   *
   * Flush runs in a `finally` so it drains on BOTH outcomes:
   *  - `produceException` RESOLVES ⇒ terminal ack (skip / non-retriable / drop).
   *  - `produceException` THROWS   ⇒ the transport WILL redeliver. The throw
   *    propagates only AFTER the finally completes, so the captured event still
   *    drains before the Lambda freezes; the caller's `catchError` re-emits it
   *    so the record fails and redelivers.
   */
  private async settle(
    exception: unknown,
    rpcHost: RpcArgumentsHost,
    policy: ResolvedRetryPolicy,
  ): Promise<unknown> {
    return await this.exceptionProducer.produceException(
      exception,
      rpcHost,
      policy.maxRetries,
      policy.skipHandler,
    );
  }
}
