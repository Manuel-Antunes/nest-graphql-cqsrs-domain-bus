import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

import { IdentityResolver } from '../../../domain/auth/identity.resolver';
import { OAUTH_SCOPES } from '../../../domain/auth/scopes';
import type { Identity } from '../../../domain/auth/vo/identity';
import { UserIdentity } from '../../../domain/auth/vo/user-identity';
import { RequestCredentials } from '../../request/request-credentials';
import { RequestHeaders } from '../../request/request-headers';
import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';
import { AccessTokens } from './access-tokens';
import { AuthRoles } from './auth-roles';

/** A session as Better Auth answers `getSession` — and as the global guard leaves it on a request. */
export interface BetterAuthSession {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly role?: string | null;
  };
  readonly session: {
    readonly id?: string;
    readonly expiresAt?: Date | string;
    readonly activeOrganizationId?: string | null;
    /** What an OAuth access token was granted (`oauth-bearer-session`); absent for a session of this system's own. */
    readonly scopes?: readonly string[];
    /** The custom claims of the OAuth access token the session stands for (`oauth-bearer-session`). */
    readonly claims?: Readonly<Record<string, unknown>>;
  };
}

const GUARDED_IDENTITY = Symbol.for('@nestposts/auth:identity');

type GuardedRequest = {
  session?: BetterAuthSession | null;
  user?: unknown;
  [GUARDED_IDENTITY]?: Identity | null;
};

/**
 * {@link IdentityResolver} over Better Auth: `getSession` with the request's headers, which reads a
 * cookie and a user's OAuth access token alike (`oauth-bearer-session`), from Redis first when there
 * is a secondary storage — and {@link AccessTokens} for a token of the client credentials grant, which
 * is no session and whose caller is a `ClientIdentity`.
 *
 * A request the global guard (`PlatformAuthGuard`) already authenticated is answered from what the
 * guard found, and a request presenting no credentials is nobody without asking. The answer is kept
 * for the request, and a lookup that failed is asked again. Needs a MikroORM request context, as
 * every Better Auth call does.
 */
@Injectable({ scope: Scope.REQUEST })
export class BetterAuthIdentityResolver extends IdentityResolver {
  private answer?: Promise<Identity | null>;

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuth,
    @Inject(REQUEST) private readonly request: unknown,
    private readonly accessTokens: AccessTokens,
  ) {
    super();
  }

  /**
   * The one translation from Better Auth's session to the domain's {@link Identity}. A session an
   * OAuth access token stands for keeps the scopes the token was granted and its custom claims as
   * attributes; any other is this system's own — a cookie — and holds every one of `OAUTH_SCOPES`.
   */
  static fromSession(
    found: BetterAuthSession | null | undefined,
  ): UserIdentity | null {
    if (!found) {
      return null;
    }
    const { session, user } = found;
    return UserIdentity.parse({
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: AuthRoles.of(user.role),
      scopes: session.scopes ?? OAUTH_SCOPES,
      activeOrganizationId: session.activeOrganizationId,
      attributes: session.claims ?? {},
      credential:
        session.scopes && session.id && session.expiresAt
          ? {
              type: 'access-token',
              tokenId: session.id,
              expiresAt: new Date(session.expiresAt),
            }
          : { type: 'session' },
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
    if (!guarded) {
      return undefined;
    }
    if (GUARDED_IDENTITY in guarded) {
      return guarded[GUARDED_IDENTITY] ?? null;
    }
    return 'session' in guarded
      ? BetterAuthIdentityResolver.fromSession(guarded.session)
      : undefined;
  }

  /**
   * Records on `request` the caller a guard authenticated without a session — an OAuth client — so
   * that whatever reads the request next ({@link guardedIdentityOf}) finds it, and nobody reads a
   * session into it.
   */
  static guard(request: unknown, identity: Identity | null): void {
    const guarded = RequestHeaders.requestOf(request) as
      | GuardedRequest
      | undefined;
    if (!guarded) {
      return;
    }
    guarded.session = null;
    guarded.user = null;
    guarded[GUARDED_IDENTITY] = identity;
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
    const headers = RequestHeaders.from(request);
    const bearer = AccessTokens.bearerOf(headers.get('authorization'));
    if (bearer && AccessTokens.isIssuedToAClient(bearer)) {
      return this.accessTokens.clientIdentityOf(bearer);
    }
    return BetterAuthIdentityResolver.fromSession(
      await this.auth.api.getSession({ headers }),
    );
  }
}
