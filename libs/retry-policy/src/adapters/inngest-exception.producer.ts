import { RpcArgumentsHost } from '@nestjs/common/internal';
import { InngestContext } from '@nestposts/microservices-inngest/inngest.context';
import { NonRetriableError, RetryAfterError } from 'inngest';

import { ExceptionProducer } from '../base-exeception-producer';
import { NonRetriableException } from '../error/non-retriable.exception';
import { RetryAfterException } from '../error/retry-after.exception';

export interface InngestExceptionProducerOptions {
  /**
   * How long Inngest waits before retrying a run that failed with an ordinary error. Left out, the
   * error is rethrown as it is and Inngest applies its own backoff.
   */
  readonly retryDelayMs?: number | ((retryCount: number) => number);
}

/**
 * Retry policy for the Inngest transport, which owns the retrying: a run that throws is retried up
 * to the function's `retries`, and one that returns is done.
 *
 *  - **retry** → THROW, as a `RetryAfterError` when `retryDelayMs` is set.
 *  - **skip / exhausted** → RETURN: the run completes.
 *  - **non-retriable** → THROW a `NonRetriableError`: the run fails and is not retried.
 *  - **retry-after** → THROW a `RetryAfterError` with the delay the exception asked for.
 */
export class InngestExceptionProducer extends ExceptionProducer {
  constructor(private readonly options: InngestExceptionProducerOptions = {}) {
    super();
  }

  getRetryCountFromContext(host: RpcArgumentsHost): number {
    const context = host.getContext<unknown>();
    if (!(context instanceof InngestContext)) {
      this.logger.warn(
        `getRetryCountFromContext: host context is not an InngestContext (got ${
          (context as { constructor?: { name?: string } })?.constructor?.name ??
          typeof context
        }) — defaulting attempt to 0; Inngest will handle retries.`,
      );
      return 0;
    }
    return Math.max(0, context.getAttempt());
  }

  protected override commitOffset(_host: RpcArgumentsHost): Promise<void> {
    return Promise.resolve();
  }

  protected override handleGenericException(
    exception: unknown,
    host: RpcArgumentsHost,
  ): never {
    const delay = this.retryDelayFor(host);
    if (delay === undefined) {
      throw exception;
    }
    throw new RetryAfterError(messageOf(exception), delay, {
      cause: exception,
    });
  }

  protected override handleNonRetryableException(
    exception: NonRetriableException,
    _host: RpcArgumentsHost,
  ): never {
    throw new NonRetriableError(exception.message, { cause: exception.cause });
  }

  protected override handleRetryAfterException(
    exception: RetryAfterException,
    _host: RpcArgumentsHost,
  ): never {
    throw new RetryAfterError(
      exception.message,
      exception.delayInMilliseconds(),
      { cause: exception.cause ?? exception },
    );
  }

  private retryDelayFor(host: RpcArgumentsHost): number | undefined {
    const { retryDelayMs } = this.options;
    return typeof retryDelayMs === 'function'
      ? retryDelayMs(this.getRetryCountFromContext(host))
      : retryDelayMs;
  }
}

const messageOf = (exception: unknown): string =>
  exception instanceof Error ? exception.message : String(exception);
