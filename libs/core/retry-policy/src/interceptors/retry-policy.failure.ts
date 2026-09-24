import type { SkipHandler } from '../decorators/retry-policy.decorator';

export interface ResolvedRetryPolicy {
  readonly maxRetries: number;
  readonly skipHandler?: SkipHandler;
}

export class RetryPolicyFailure {
  constructor(
    readonly cause: unknown,
    readonly policy: ResolvedRetryPolicy,
  ) {}
}
