import { oauthProvider } from '@better-auth/oauth-provider';
import type { FactoryProvider } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError } from 'better-auth/api';

import { SYSTEM_ADMIN_ROLE } from '../../../domain/auth/roles';
import type { AuthConfig } from '../config';
import { BETTER_AUTH_CONFIG } from '../tokens';
import { OAUTH_PROVIDER_BETTER_AUTH_PLUGIN } from './tokens';

export const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'read:posts',
  'write:posts',
];

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
      scopes: OAUTH_SCOPES,
      enforcePerClientResources: false,
      clientPrivileges: oauthClientPrivileges,
      silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
    });
    return plugin as typeof plugin & BetterAuthPlugin;
  },
  inject: [BETTER_AUTH_CONFIG],
} satisfies FactoryProvider;
