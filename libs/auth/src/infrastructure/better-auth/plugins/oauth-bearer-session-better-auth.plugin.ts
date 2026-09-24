import type { FactoryProvider } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { verifyJWT } from 'better-auth/plugins';

import type { AuthConfig } from '../config';
import { BETTER_AUTH_CONFIG } from '../tokens';
import { OAUTH_BEARER_SESSION_BETTER_AUTH_PLUGIN } from './tokens';

export interface OAuthBearerSessionOptions {
  /** The `iss` an access token must carry — the one this deployment's jwt plugin signs with. */
  readonly issuer: string;
  /** The resources a token may be addressed to (`aud`): the gateway, and whatever else is one. */
  readonly audiences: readonly string[];
}

const signedBearerOf = (authorization: string | null | undefined) => {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return token && token.split('.').length === 3 ? token : undefined;
};

/**
 * **An OAuth 2.0 access token is a session.** A request carrying `Authorization: Bearer <JWT>` — an
 * access token this deployment's `oauthProvider` issued for one of its resources — answers
 * `getSession` as the user the token was issued for.
 *
 * It is a `before` hook on `/get-session`, so everything that asks Better Auth for a session sees it
 * the same way: the global guard, `@Session()`, `AuthService`. The token is verified LOCALLY, with the
 * keys the jwt plugin keeps in the database every process shares — no call to the issuer, no JWKS
 * fetch. Anything that is not such a token (a cookie, an opaque session token, an ID token addressed
 * to a client) falls through to Better Auth's own lookup untouched, and a token for a user who no
 * longer exists, or is banned, answers no session.
 */
export const oauthBearerSession = (options: OAuthBearerSessionOptions) =>
  ({
    id: 'oauth-bearer-session',
    hooks: {
      before: [
        {
          matcher: (context) => context.path === '/get-session',
          handler: createAuthMiddleware(async (ctx) => {
            const token = signedBearerOf(ctx.headers?.get('authorization'));
            if (!token) return;
            const claims = await verifyJWT(token, {
              jwt: {
                issuer: options.issuer,
                audience: [...options.audiences],
              },
            });
            if (!claims) return;
            const user = await ctx.context.internalAdapter.findUserById(
              claims.sub,
            );
            if (!user || (user as { banned?: boolean | null }).banned) {
              return ctx.json(null);
            }
            const issuedAt = new Date((claims.iat ?? 0) * 1000);
            return ctx.json({
              session: {
                id: claims.jti ?? `oauth:${claims.sub}:${claims.iat ?? 0}`,
                token: '',
                userId: user.id,
                expiresAt: new Date((claims.exp ?? 0) * 1000),
                createdAt: issuedAt,
                updatedAt: issuedAt,
                ipAddress: null,
                userAgent: null,
                activeOrganizationId: null,
                activeTeamId: null,
                impersonatedBy: null,
              },
              user,
            });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

export const OAuthBearerSessionBetterAuthPluginProvider = {
  provide: OAUTH_BEARER_SESSION_BETTER_AUTH_PLUGIN,
  useFactory: (config: AuthConfig) =>
    oauthBearerSession({
      issuer: config.issuer,
      audiences: config.oauthResources,
    }),
  inject: [BETTER_AUTH_CONFIG],
} satisfies FactoryProvider;
