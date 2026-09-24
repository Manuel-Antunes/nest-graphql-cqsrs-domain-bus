import type {
  CallHandler,
  DynamicModule,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { HttpException, Inject, Injectable, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { Context } from '@opentelemetry/api';
import { context as activeContext } from '@opentelemetry/api';
import { SentryModule } from '@sentry/nestjs/setup';
import type { Observable } from 'rxjs';
import { catchError, from, mergeMap, throwError } from 'rxjs';

import { reportError } from './error-reporting';

export interface ErrorReportingModuleOptions {
  /**
   * **The trace a failed message belongs to.** The handler's own spans have ended by the time a
   * failure reaches the interceptor, and what is active then is the delivery's — the Lambda
   * invocation, the consumer loop — not the request that published the message. Given the trace the
   * message carries, the report opens onto the trace of the work that failed. `IncomingRequest.traceOf`
   * (`@nestposts/transport-eventbus`) answers it for the transport's envelope.
   */
  readonly traceOf?: (context: ExecutionContext) => Context | undefined;
}

const ERROR_REPORTING_OPTIONS = Symbol('ERROR_REPORTING_OPTIONS');

/**
 * What was thrown, out of whatever carried it. `@RetryPolicy` rethrows a failure inside a
 * `RetryPolicyFailure` — not an `Error`, only something with a `cause` — and the report is about
 * the cause. An `Error` with a `cause` is reported as it is: Sentry follows the chain on its own.
 */
const unwrapped = (failure: unknown): unknown =>
  !(failure instanceof Error) &&
  typeof failure === 'object' &&
  failure !== null &&
  'cause' in failure
    ? unwrapped(failure.cause)
    : failure;

/** A 4xx is the answer the handler meant to give, not a failure of this service. */
const expected = (failure: unknown): boolean =>
  failure instanceof HttpException && failure.getStatus() < 500;

/**
 * **Every handler that failed outside GraphQL, reported and rethrown untouched.**
 *
 * Global, so it wraps every message handler and every HTTP route — the microservice of a hybrid
 * application inherits it — and outermost, so it sees what escaped everything else, `@RetryPolicy`
 * included. It changes nothing about the failure: the transport still retries it, the filters still
 * answer it. In a Lambda it holds the failure until the report is delivered (see `reportError`).
 *
 * GraphQL is left to `useGraphQLErrorReporting`, which reports only what none of the application's
 * exception filters turned into an answer — something an interceptor, which runs before them, cannot
 * know.
 */
@Injectable()
export class ErrorReportingInterceptor implements NestInterceptor {
  constructor(
    @Inject(ERROR_REPORTING_OPTIONS)
    private readonly options: ErrorReportingModuleOptions,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<string>() === 'graphql') {
      return next.handle();
    }
    return next
      .handle()
      .pipe(
        catchError((failure: unknown) =>
          from(this.report(context, failure)).pipe(
            mergeMap(() => throwError(() => failure)),
          ),
        ),
      );
  }

  private async report(
    context: ExecutionContext,
    failure: unknown,
  ): Promise<void> {
    const reported = unwrapped(failure);
    if (expected(reported)) {
      return;
    }
    const hint = {
      mechanism: { handled: false, type: `auto.${context.getType()}.nestjs` },
    };
    const trace = this.options.traceOf?.(context);
    await (trace
      ? activeContext.with(trace, () => reportError(reported, hint))
      : reportError(reported, hint));
  }
}

/**
 * **Errors, reported from inside Nest** — `SentryModule`, the Nest SDK's own root module, and
 * {@link ErrorReportingInterceptor} on every handler. Imported once, by the application's root
 * module, beside `loggingModule`. The SDK itself is started by `startTelemetry`, before anything is
 * loaded; with no `SENTRY_DSN` every report is a no-op.
 */
@Module({})
export class ErrorReportingModule {
  static forRoot(options: ErrorReportingModuleOptions = {}): DynamicModule {
    return {
      module: ErrorReportingModule,
      global: true,
      imports: [SentryModule.forRoot()],
      providers: [
        { provide: ERROR_REPORTING_OPTIONS, useValue: options },
        { provide: APP_INTERCEPTOR, useClass: ErrorReportingInterceptor },
      ],
    };
  }
}
