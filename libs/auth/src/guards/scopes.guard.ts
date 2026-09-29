import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, Scope } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IdentityResolver } from '../domain/auth/identity.resolver';
import type { OAuthScope } from '../domain/auth/scopes';

/**
 * **What a caller's credential may be used for** — the guard behind `@RequireScopes()`. It refuses,
 * with a 403, a caller whose OAuth access token was not granted every scope the handler and its class
 * require; a caller signed in through this system's own screens holds every scope and passes.
 *
 * Scopes narrow what a credential may do, they do not decide whether one is needed: nobody passes,
 * and whether nobody may call the handler at all is the global guard's (`@AllowAnonymous()`).
 *
 * Request-scoped, and declared so rather than left to the {@link IdentityResolver} it asks: left to
 * scope bubbling, posts-api's resolvers were handed an instance whose constructor never ran, and every
 * guarded operation failed on `this.reflector` being undefined. What it hosts is request-scoped too.
 */
@Injectable({ scope: Scope.REQUEST })
export class ScopesGuard implements CanActivate {
  /** The scopes a handler or a class requires; the class's and the handler's add up. */
  static readonly required = Reflector.createDecorator<readonly OAuthScope[]>();

  constructor(
    private readonly caller: IdentityResolver,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = [
      ...new Set(
        this.reflector.getAllAndMerge(ScopesGuard.required, [
          context.getHandler(),
          context.getClass(),
        ]),
      ),
    ];
    if (required.length === 0) {
      return true;
    }
    const identity = await this.caller.identity();
    if (!identity || identity.hasScopes(required)) {
      return true;
    }
    throw new ForbiddenException(
      `The access token was not granted the scopes this requires: ${required.join(' ')}`,
    );
  }
}
