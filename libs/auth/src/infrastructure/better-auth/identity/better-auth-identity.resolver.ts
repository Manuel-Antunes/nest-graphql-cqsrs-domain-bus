import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

import { IdentityResolver } from '../../../domain/auth/identity.resolver';
import { Identity } from '../../../domain/auth/vo/identity';
import { RequestCredentials } from '../../request/request-credentials';
import { RequestHeaders } from '../../request/request-headers';
import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';
import { AuthRoles } from './auth-roles';

/** A session as Better Auth answers `getSession` — and as the global guard leaves it on a request. */
export interface BetterAuthSession {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly role?: string | null;
  };
  readonly session: { readonly activeOrganizationId?: string | null };
}

type GuardedRequest = { session?: BetterAuthSession | null };

/**
 * {@link IdentityResolver} over Better Auth: `getSession` with the request's headers, which reads a
 * cookie and an OAuth access token alike (`oauth-bearer-session`), from Redis first when there is a
 * secondary storage.
 *
 * A request the global guard (`@thallesp/nestjs-better-auth`) already authenticated is answered from
 * the session it wrote on the request, and a request presenting no credentials is nobody without
 * asking. The answer is kept for the request, and a lookup that failed is asked again. Needs a
 * MikroORM request context, as every Better Auth call does.
 */
@Injectable({ scope: Scope.REQUEST })
export class BetterAuthIdentityResolver extends IdentityResolver {
  private answer?: Promise<Identity | null>;

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuth,
    @Inject(REQUEST) private readonly request: unknown,
  ) {
    super();
  }

  /** The one translation from Better Auth's session to the domain's {@link Identity}. */
  static fromSession(
    found: BetterAuthSession | null | undefined,
  ): Identity | null {
    if (!found) {
      return null;
    }
    return Identity.parse({
      userId: found.user.id,
      email: found.user.email,
      name: found.user.name,
      roles: AuthRoles.of(found.user.role),
      activeOrganizationId: found.session.activeOrganizationId,
    });
  }

  /**
   * The identity the global guard found for `request`; `undefined` when the guard did not run on it.
   * Synchronous, for a parameter decorator.
   */
  static guardedIdentityOf(request: unknown): Identity | null | undefined {
    const guarded = RequestHeaders.requestOf(request) as
      | GuardedRequest
      | undefined;
    return guarded && 'session' in guarded
      ? BetterAuthIdentityResolver.fromSession(guarded.session)
      : undefined;
  }

  identity(): Promise<Identity | null> {
    if (!this.answer) {
      this.answer = this.lookup();
      this.answer.catch(() => {
        this.answer = undefined;
      });
    }
    return this.answer;
  }

  private async lookup(): Promise<Identity | null> {
    const request = RequestHeaders.requestOf(this.request);
    if (!request) {
      return null;
    }
    const guarded = BetterAuthIdentityResolver.guardedIdentityOf(request);
    if (guarded !== undefined) {
      return guarded;
    }
    if (RequestCredentials.of(request).isAnonymous) {
      return null;
    }
    return BetterAuthIdentityResolver.fromSession(
      await this.auth.api.getSession({
        headers: RequestHeaders.from(request),
      }),
    );
  }
}
