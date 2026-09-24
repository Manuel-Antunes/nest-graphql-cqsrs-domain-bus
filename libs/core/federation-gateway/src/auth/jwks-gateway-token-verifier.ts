import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { GatewayIdentity } from './gateway-identity';
import { GatewayTokenVerifier } from './gateway-identity';

export interface JwksGatewayTokenVerifierOptions {
  /** The identity provider's JSON Web Key Set, e.g. `https://…/api/auth/jwks`. */
  readonly jwksUrl: string;
  /** The `iss` a token must carry. */
  readonly issuer: string;
  /** The `aud` a token must carry — this gateway, as the resource it was issued for. */
  readonly audience: string | readonly string[];
}

/**
 * Verifies an OAuth 2.0 access token that is a JWT, against the issuer's published keys. The key set
 * is fetched once and cached by `jose`, which refetches it when a token names a key it has not seen.
 * An opaque token — a session token, say — is not a JWT and answers `null` without a network call.
 */
export class JwksGatewayTokenVerifier extends GatewayTokenVerifier {
  private readonly keys: JWTVerifyGetKey;

  constructor(private readonly options: JwksGatewayTokenVerifierOptions) {
    super();
    this.keys = createRemoteJWKSet(new URL(options.jwksUrl));
  }

  private static claim(payload: JWTPayload, name: string): string | undefined {
    const value = payload[name];
    return typeof value === 'string' && value ? value : undefined;
  }

  private bearerTokenOf(authorization: string | undefined): string | undefined {
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    return match?.[1];
  }

  async verify(
    authorization: string | undefined,
  ): Promise<GatewayIdentity | null> {
    const token = this.bearerTokenOf(authorization);
    if (token?.split('.').length !== 3) return null;
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.options.issuer,
        audience: [...[this.options.audience].flat()],
      });
      return JwksGatewayTokenVerifier.identityOf(payload);
    } catch {
      return null;
    }
  }

  private static identityOf(payload: JWTPayload): GatewayIdentity {
    return {
      subject: payload.sub,
      clientId:
        JwksGatewayTokenVerifier.claim(payload, 'azp') ??
        JwksGatewayTokenVerifier.claim(payload, 'client_id'),
      scopes: (JwksGatewayTokenVerifier.claim(payload, 'scope') ?? '')
        .split(' ')
        .filter(Boolean),
      organizationId: JwksGatewayTokenVerifier.claim(
        payload,
        'organization_id',
      ),
      organizationSlug: JwksGatewayTokenVerifier.claim(
        payload,
        'organization_slug',
      ),
    };
  }
}
