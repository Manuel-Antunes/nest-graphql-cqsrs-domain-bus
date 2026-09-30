import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JSONWebKeySet, JWTPayload } from 'jose';
import { createLocalJWKSet, decodeJwt, jwtVerify } from 'jose';

import type { AuthConfig } from '../../../config/auth.config';
import { authConfig } from '../../../config/auth.config';
import { ClientIdentity } from '../../../domain/auth/vo/client-identity';
import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';

/**
 * **The OAuth access tokens this deployment issues, read back.** A bearer is one of two things: a token
 * a client was granted on a user's behalf — `oauth-bearer-session` answers it as that user's session —
 * or a token of the client credentials grant, whose subject is the client itself (`sub` = `client_id`).
 * The second is no session and no user, so it is read here, into a {@link ClientIdentity}: verified
 * against the keys the jwt plugin keeps (`getJwks`, no network), for this deployment's issuer and
 * resources, and as an access token (`typ` `at+jwt`) — an ID token or a session JWT signed with the
 * same keys is refused.
 *
 * The claims beyond the registered ones — what an issuer added (`customAccessTokenClaims`, a client's
 * `metadata.claims`) — are the identity's `attributes`.
 */
@Injectable()
export class AccessTokens {
  /** The `typ` of an OAuth access token (RFC 9068). */
  static readonly ACCESS_TOKEN_TYPE = 'at+jwt';
  /** The claim a client's token names the organization it was registered for in. */
  static readonly ORGANIZATION_CLAIM = 'organization_id';

  private static readonly REGISTERED_CLAIMS = new Set([
    'iss',
    'sub',
    'aud',
    'exp',
    'nbf',
    'iat',
    'jti',
    'scope',
    'client_id',
    'azp',
    'sid',
    'cnf',
    'typ',
    'auth_time',
    'acr',
    'amr',
    'nonce',
    'at_hash',
    'c_hash',
    'act',
    'may_act',
  ]);

  private readonly logger = new Logger(AccessTokens.name);

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuth,
    @Inject(authConfig.KEY)
    private readonly config: Pick<AuthConfig, 'issuer' | 'oauthResources'>,
  ) {}

  /** The token of an `Authorization: Bearer <JWT>` header; `undefined` for anything else. */
  static bearerOf(authorization: string | null | undefined) {
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    return token && token.split('.').length === 3 ? token : undefined;
  }

  /**
   * Whether a token, read WITHOUT verifying it, is one of the client credentials grant — its subject
   * is its own client. It only decides which way a bearer is read; whatever is read is verified.
   */
  static isIssuedToAClient(token: string): boolean {
    try {
      const { sub, client_id: clientId } = decodeJwt(token);
      return typeof sub === 'string' && sub === clientId;
    } catch {
      return false;
    }
  }

  /** The claims an issuer added to a token: everything but the registered ones. */
  static attributesOf(claims: JWTPayload): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(claims).filter(
        ([name]) => !AccessTokens.REGISTERED_CLAIMS.has(name),
      ),
    );
  }

  /** The scopes a token was granted, out of its space-separated `scope` claim. */
  static scopesOf(scope: unknown): string[] {
    return typeof scope === 'string' ? scope.split(/\s+/).filter(Boolean) : [];
  }

  /**
   * The client a token of the client credentials grant stands for, or `null` when it does not hold
   * up: a bad signature, another issuer, a resource that is not this deployment's, no access token,
   * expired, or not a client's own token.
   */
  async clientIdentityOf(token: string): Promise<ClientIdentity | null> {
    try {
      const { payload } = await jwtVerify(
        token,
        createLocalJWKSet(await this.keys()),
        {
          issuer: this.config.issuer,
          audience: [...this.config.oauthResources],
          typ: AccessTokens.ACCESS_TOKEN_TYPE,
          requiredClaims: ['sub', 'jti', 'exp'],
        },
      );
      if (payload.sub !== payload.client_id) {
        return null;
      }
      const organizationId = payload[AccessTokens.ORGANIZATION_CLAIM];
      return ClientIdentity.parse({
        clientId: payload.sub,
        scopes: AccessTokens.scopesOf(payload.scope),
        activeOrganizationId:
          typeof organizationId === 'string' ? organizationId : null,
        attributes: AccessTokens.attributesOf(payload),
        credential: {
          type: 'access-token',
          tokenId: payload.jti,
          expiresAt: new Date((payload.exp as number) * 1000),
        },
      });
    } catch (failure) {
      this.logger.warn(
        `a client's access token was refused: ${(failure as Error)?.message ?? String(failure)}`,
      );
      return null;
    }
  }

  private async keys(): Promise<JSONWebKeySet> {
    return (await this.auth.api.getJwks({})) as JSONWebKeySet;
  }
}
