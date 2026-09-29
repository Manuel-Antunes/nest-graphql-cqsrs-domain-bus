import { applyDecorators, UseGuards } from '@nestjs/common';

import type { OAuthScope } from '../domain/auth/scopes';
import { ScopesGuard } from '../guards/scopes.guard';

/**
 * **Only a credential granted every one of `scopes`** — on a handler or a class, whose scopes add up.
 * An OAuth access token lacking one is refused with a 403 (`FORBIDDEN` in GraphQL); a cookie of this
 * system's own holds every scope, and nobody passes, leaving that to the global guard.
 *
 * ```ts
 * @RequireScopes('write:posts')
 * @Mutation('createPost')
 * ```
 */
export const RequireScopes = (...scopes: OAuthScope[]) =>
  applyDecorators(ScopesGuard.required(scopes), UseGuards(ScopesGuard));
