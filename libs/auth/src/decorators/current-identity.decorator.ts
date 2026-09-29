import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

import type { Identity } from '../domain/auth/vo/identity';
import { BetterAuthIdentityResolver } from '../infrastructure/better-auth/identity/better-auth-identity.resolver';
import { ExecutionRequest } from '../infrastructure/request/execution-request';

/**
 * **The caller, as an {@link Identity}** — `null` for nobody. Pipes compose on it
 * (`CurrentIdentity(SomePipe)`), which is how `@CurrentUser()` and `@CurrentAuthor()` are built.
 *
 * It reads what the global guard found, so it answers in an application that installs the guard
 * (`AuthInfrastructureModule`'s default), after the guard's refusal — never instead of it.
 */
export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Identity | null =>
    BetterAuthIdentityResolver.guardedIdentityOf(
      ExecutionRequest.of(context),
    ) ?? null,
);
