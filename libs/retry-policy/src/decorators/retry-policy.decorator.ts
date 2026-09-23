import {
  applyDecorators,
  SetMetadata,
  type Type,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import type { RpcArgumentsHost } from '@nestjs/common/internal';

import { MaxRetriesFilter } from '../interceptors/max-retries.filter';
import { MaxRetriesInterceptor } from '../interceptors/max-retries.interceptor';

/** Reflector metadata keys read by `MaxRetriesInterceptor`. */
export const EXCEPTION_MAX_RETRIES_KEY = 'exception:maxRetries';
export const EXCEPTION_SKIP_HANDLER_KEY = 'exception:skipHandler';
export const EXCEPTION_SKIP_HANDLER_TOKEN_KEY = 'exception:skipHandlerToken';

/**
 * Invoked once when a handler's retries are exhausted, right before the message
 * is dropped/acked. Receives the live `RpcArgumentsHost` so it can read the
 * payload (`host.getData()`) and context (`host.getContext()`) — e.g. to send
 * the poison message to a dead-letter table or emit an alert.
 */
export type SkipHandler = (host: RpcArgumentsHost) => Promise<void> | void;

/**
 * DI-resolvable counterpart of {@link SkipHandler}. Implement + register it as a
 * provider, then reference it by token via `@RetryPolicy({ skipHandlerToken })`
 * — the interceptor resolves it through `ModuleRef`, so the strategy can inject
 * services (EventBus, repositories, …) that an inline closure can't reach.
 */
export interface SkipHandlerStrategy {
  handle(host: RpcArgumentsHost): Promise<void> | void;
}

/** A DI token resolving to a {@link SkipHandlerStrategy}. */
export type SkipHandlerToken = Type<SkipHandlerStrategy> | string | symbol;

export interface RetryPolicyOptions {
  /**
   * Max retries (0-based, matching the transport's retry count) before the
   * skip handler runs and the message is dropped. e.g. `maxRetries: 3` ⇒ up
   * to 4 total deliveries.
   */
  maxRetries: number;
  /** Inline skip handler — for simple, dependency-free side effects. */
  skipHandler?: SkipHandler;
  /**
   * DI-resolved skip handler strategy (a provider implementing
   * {@link SkipHandlerStrategy}). Use this when the skip side effect needs
   * injected services — e.g. publishing a domain event via `EventBus`. Takes
   * precedence over `skipHandler` if both are set.
   */
  skipHandlerToken?: SkipHandlerToken;
}

/**
 * Declares a per-handler retry policy consumed by `MaxRetriesInterceptor`.
 * Pair it with `@UseInterceptors(MaxRetriesInterceptor)` on the same handler:
 *
 * ```ts
 * @EventPattern(EventTypes.POLL_JUDIT_CASE_SEARCH)
 * @UseInterceptors(MaxRetriesInterceptor)
 * @RetryPolicy({ maxRetries: 10, skipHandlerToken: JuditPollSkipHandler })
 * async handle(@Payload() job: Job) { ... }
 * ```
 */
export function RetryPolicy(options: RetryPolicyOptions) {
  const decorators = [
    SetMetadata(EXCEPTION_MAX_RETRIES_KEY, options.maxRetries),
  ];
  if (options.skipHandler) {
    decorators.push(
      SetMetadata(EXCEPTION_SKIP_HANDLER_KEY, options.skipHandler),
    );
  }
  if (options.skipHandlerToken) {
    decorators.push(
      SetMetadata(EXCEPTION_SKIP_HANDLER_TOKEN_KEY, options.skipHandlerToken),
    );
  }
  return applyDecorators(
    ...decorators,
    UseInterceptors(MaxRetriesInterceptor),
    UseFilters(MaxRetriesFilter),
  );
}
