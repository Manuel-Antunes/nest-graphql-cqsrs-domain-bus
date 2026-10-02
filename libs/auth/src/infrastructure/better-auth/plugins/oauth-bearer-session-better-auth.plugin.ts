import type { FactoryProvider } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { verifyJWT } from 'better-auth/plugins';

import type { AuthConfig } from '../../../config/auth.config';
import { authConfig } from '../../../config/auth.config';
import { AccessTokens } from '../identity/access-tokens';
import { OAUTH_BEARER_SESSION_BETTER_AUTH_PLUGIN } from './tokens';

export interface OAuthBearerSessionOptions {
  /** The `iss` an access token must carry — the one this deployment's jwt plugin signs with. */
  readonly issuer: string;
  /** The resources a token may be addressed to (`aud`): the gateway, and whatever else is one. */
  readonly audiences: readonly string[];
}

/**
 * **A user's OAuth 2.0 access token is a session.** A request carrying `Authorization: Bearer <JWT>` —
 * an access token this deployment's `oauthProvider` issued for one of its resources — answers
 * `getSession` as the user the token was issued for, and the session carries `scopes`: what the
 * token was granted, from its `scope` claim — none when it names none — and `claims`, the custom
 * claims the issuer added, which the identity keeps as its attributes. A session of this system's own
 * has no `scopes` at all, which is how the two are told apart. The token's `organization_id`, when it
 * has one, is the session's active organization: the tenant the person delegated it in.
 *
 * A token of the client credentials grant (`sub` = `client_id`) is no user's, so it is no session:
 * it is left alone, unverified, and `AccessTokens` reads it as a `ClientIdentity` instead.
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
            const token = AccessTokens.bearerOf(
              ctx.headers?.get('authorization'),
            );
            if (!token || AccessTokens.isIssuedToAClient(token)) return;
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
                activeOrganizationId:
                  typeof claims[AccessTokens.ORGANIZATION_CLAIM] === 'string'
                    ? claims[AccessTokens.ORGANIZATION_CLAIM]
                    : null,
                activeTeamId: null,
                impersonatedBy: null,
                scopes: AccessTokens.scopesOf(claims.scope),
                claims: AccessTokens.attributesOf(claims),
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
  inject: [authConfig.KEY],
} satisfies FactoryProvider;
