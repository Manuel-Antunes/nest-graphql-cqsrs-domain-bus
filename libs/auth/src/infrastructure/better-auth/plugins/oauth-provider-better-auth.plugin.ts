import { oauthProvider } from '@better-auth/oauth-provider';
import type { FactoryProvider } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError } from 'better-auth/api';

import type { AuthConfig } from '../../../config/auth.config';
import { authConfig } from '../../../config/auth.config';
import { SYSTEM_ADMIN_ROLE } from '../../../domain/auth/roles';
import { OAUTH_SCOPES } from '../../../domain/auth/scopes';
import { AccessTokens } from '../identity/access-tokens';
import { OAUTH_PROVIDER_BETTER_AUTH_PLUGIN } from './tokens';

const READ_ONLY = new Set(['read', 'list']);

const rolesOf = (role: unknown): string[] =>
  typeof role === 'string' ? role.split(',').map((entry) => entry.trim()) : [];

/** The `code` of the 403 a non-admin gets for anything but reading an OAuth client. */
export const OAUTH_CLIENT_ADMIN_REQUIRED = 'OAUTH_CLIENT_ADMIN_REQUIRED';

/**
 * **Who may do what to an OAuth client**: anybody signed in may read and list them; only a system
 * `admin` may create, update, rotate or delete one.
 *
 * A refusal is a **403 that says why**. Answering `false` leaves the answer to the plugin, which is a
 * message-less `UNAUTHORIZED` — a 401, which every client (better-auth-ui included) reads as an
 * expired session and answers with "Please sign in again", to a user who is signed in.
 */
export const oauthClientPrivileges = ({
  action,
  user,
}: {
  readonly action: string;
  readonly user?: Readonly<Record<string, unknown>> | null;
}): boolean => {
  if (
    READ_ONLY.has(action) ||
    rolesOf(user?.role).includes(SYSTEM_ADMIN_ROLE)
  ) {
    return true;
  }
  throw new APIError('FORBIDDEN', {
    code: OAUTH_CLIENT_ADMIN_REQUIRED,
    message: `Only an ${SYSTEM_ADMIN_ROLE} can ${action} an OAuth client`,
  });
};

/**
 * **The claims a client's access tokens carry.** A client-credentials token has no user to derive
 * anything from, so what binds it is stated where the client is registered:
 *
 * - the organization it was registered for — its `referenceId` — is `organization_id` in every token it
 *   is issued for itself, which is the `activeOrganizationId` of the `ClientIdentity` it is read as;
 * - a client whose `metadata` holds a `claims` object gets those claims copied, top level, into every
 *   access token it is issued — the Chatwoot agent bot's `agent_bot_id` — which are the identity's
 *   attributes.
 *
 * Reserved claims (`iss`, `sub`, `aud`, `scope`, …) are stripped by the provider itself.
 */
export class OAuthClientClaims {
  static of(metadata: Readonly<Record<string, unknown>> | undefined) {
    const claims = metadata?.claims;
    return claims && typeof claims === 'object' && !Array.isArray(claims)
      ? { ...(claims as Record<string, unknown>) }
      : {};
  }

  /** Every claim an access token is issued with, the organization last so that nothing overrides it. */
  static forAccessToken({
    metadata,
    client,
    grantType,
  }: {
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly client: { readonly referenceId?: string | null };
    readonly grantType?: string;
  }): Record<string, unknown> {
    return {
      ...OAuthClientClaims.of(metadata),
      ...(grantType === 'client_credentials' &&
        client.referenceId && {
          [AccessTokens.ORGANIZATION_CLAIM]: client.referenceId,
        }),
    };
  }
}

export const OAuthProviderBetterAuthPluginProvider = {
  provide: OAUTH_PROVIDER_BETTER_AUTH_PLUGIN,
  useFactory: (config: AuthConfig) => {
    const plugin = oauthProvider({
      loginPage: `${config.webUrl}/auth/sign-in`,
      consentPage: `${config.webUrl}/auth/oauth-consent`,
      signup: { page: `${config.webUrl}/auth/oauth-sign-up` },
      selectAccount: {
        page: `${config.webUrl}/auth/select-account`,
        shouldRedirect: () => false,
      },
      scopes: [...OAUTH_SCOPES],
      enforcePerClientResources: false,
      clientPrivileges: oauthClientPrivileges,
      extensions: [
        {
          claims: {
            accessToken: (input) => OAuthClientClaims.forAccessToken(input),
          },
        },
      ],
      silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
    });
    return plugin as typeof plugin & BetterAuthPlugin;
  },
  inject: [authConfig.KEY],
} satisfies FactoryProvider;
