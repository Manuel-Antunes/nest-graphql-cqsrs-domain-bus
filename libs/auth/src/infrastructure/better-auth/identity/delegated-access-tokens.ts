import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { IdentityIsNotAUserException } from '../../../domain/auth/exception/identity-is-not-a-user.exception';
import type { Identity } from '../../../domain/auth/vo/identity';
import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';
import { AccessTokens } from './access-tokens';

/** What a delegated token is asked for. */
export interface DelegatedAccessTokenRequest {
  /** The resources it is addressed to (`aud`) — every one the request will reach on the person's behalf. */
  readonly audiences: readonly string[];
  /** The scopes it is asked for. It carries only those the person holds. */
  readonly scopes: readonly string[];
  /** How long it lives, in seconds. Fifteen minutes when left out. */
  readonly expiresIn?: number;
}

/**
 * **An access token for the signed-in person, issued by the authorization server they signed in
 * to** — for a process of this deployment that acts for them somewhere a cookie does not travel: the
 * web, say, calling an agent on Amazon Bedrock AgentCore Runtime, whose JWT authorizer reads a bearer
 * and nothing else.
 *
 * It is what the OAuth authorization code grant would have produced, without the round trip through
 * the browser — the process asking IS the authorization server, holding the person's session — and it
 * reads back exactly as one: signed with the jwt plugin's keys, this deployment's `iss`, the `sub` of
 * the person, the audiences asked for, and the `scope` they were granted, which `oauth-bearer-session`
 * turns into a session in every Better Auth process that accepts one of those audiences.
 *
 * It carries the person's active organization as `organization_id` — the tenant they act in, in the
 * token, which is where AgentCore wants a tenant: the session it reads back as has that organization
 * active, so the gateway, the agents and every subgraph behind them name the same tenant. Being a
 * member is still checked wherever the tenant is used (`TenantMembershipGuard`).
 *
 * Only a person delegates: an OAuth client acting for itself is refused with
 * {@link IdentityIsNotAUserException}. And a token never holds more than its holder: a scope the
 * person does not hold is left out, whatever was asked.
 */
@Injectable()
export class DelegatedAccessTokens {
  /** How long a delegated token lives when the request says nothing. */
  static readonly DEFAULT_EXPIRES_IN = 15 * 60;

  constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuth) {}

  async issueFor(
    identity: Identity,
    request: DelegatedAccessTokenRequest,
  ): Promise<string> {
    if (identity.kind !== 'user') {
      throw new IdentityIsNotAUserException(
        'only a person delegates an access token; an OAuth client asks the authorization server for its own',
      );
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const { token } = await this.auth.api.signJWT({
      body: {
        payload: {
          sub: identity.principal,
          aud: [...request.audiences],
          scope: request.scopes
            .filter((scope) => identity.scopes.includes(scope))
            .join(' '),
          ...(identity.activeOrganizationId && {
            [AccessTokens.ORGANIZATION_CLAIM]: identity.activeOrganizationId,
          }),
          jti: randomUUID(),
          iat: issuedAt,
          exp:
            issuedAt +
            (request.expiresIn ?? DelegatedAccessTokens.DEFAULT_EXPIRES_IN),
        },
      },
    });
    return token;
  }
}
