import { ConfigurableModuleBuilder, Module } from '@nestjs/common';

import { ExceptionProducer } from './base-exeception-producer';
import { MaxRetriesFilter } from './interceptors/max-retries.filter';
import { MaxRetriesInterceptor } from './interceptors/max-retries.interceptor';

export const EXCEPTION_PRODUCER = 'EXCEPTION_PRODUCER';
export const MAX_RETRIES = 'MAX_RETRIES';

export interface RetryPolicyModuleOptions {
  /**
   * The default max retries for handlers that don't set one via `@RetryPolicy`.
   */
  defaultMaxRetries?: number;
  /**
   * The exception producer to use for the transport.
   */
  exceptionProducer: ExceptionProducer;
}

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN,
  ASYNC_OPTIONS_TYPE,
  OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<RetryPolicyModuleOptions>()
  .setFactoryMethodName('createRetryPolicyModuleOptions')
  .setClassMethodName('forRoot')
  // GLOBAL by default, and that's structural rather than a convenience: Nest
  // resolves a `@UseInterceptors(MaxRetriesInterceptor)` / `@UseFilters(
  // MaxRetriesFilter)` class from the injectables of the module that DECLARES
  // the controller (`InterceptorsContextCreator#getInstanceByMetatype` reads
  // `moduleRef.injectables`), so each enhancer is instantiated in THAT module's
  // context and needs `EXCEPTION_PRODUCER` / `MAX_RETRIES` reachable from it.
  // Exporting globally from the root registration is what spares every feature
  // module (`LegalMsModule`, `PetitionMsModule`, `NatashaModule`, …) from
  // becoming configurable itself just to thread the producer through.
  .setExtras({ isGlobal: true }, (definition, extras) => ({
    ...definition,
    global: extras.isGlobal,
  }))
  .build();

/**
 * Wires the opt-in retry/skip policy for `@EventPattern` handlers.
 *
 * Register it ONCE at the app root — the composition root is what knows the
 * inbound transport, so it passes the matching `exceptionProducer`:
 *
 * ```ts
 * RetryPolicyModule.forRoot({
 *   exceptionProducer:
 *     process.env.INFRA_PROVIDER === 'aws'
 *       ? new SqsExceptionProducer()
 *       : new InngestExceptionProducer(),
 * })
 * ```
 *
 * Then on a handler apply BOTH `@UseInterceptors(MaxRetriesInterceptor)` +
 * `@UseFilters(MaxRetriesFilter)`, plus `@RetryPolicy({ maxRetries, … })` (the
 * `@RetryPolicy` decorator wires both for you). The interceptor reads the
 * per-handler policy; the method-scoped filter does the error→transport mapping
 * (and preempts any global `@Catch()` filter that would otherwise swallow it).
 *
 * `MAX_RETRIES` is the fallback when a handler doesn't set one — override it
 * with `defaultMaxRetries`.
 */
@Module({
  providers: [
    {
      provide: EXCEPTION_PRODUCER,
      inject: [MODULE_OPTIONS_TOKEN],
      useFactory: (config: RetryPolicyModuleOptions) => {
        return config.exceptionProducer;
      },
    },
    {
      provide: MAX_RETRIES,
      inject: [MODULE_OPTIONS_TOKEN],
      useFactory: (config: RetryPolicyModuleOptions) => {
        return config.defaultMaxRetries ?? 5;
      },
    },
    MaxRetriesInterceptor,
    MaxRetriesFilter,
  ],
  exports: [
    EXCEPTION_PRODUCER,
    MAX_RETRIES,
    MaxRetriesInterceptor,
    MaxRetriesFilter,
  ],
})
export class RetryPolicyModule extends ConfigurableModuleClass {}
