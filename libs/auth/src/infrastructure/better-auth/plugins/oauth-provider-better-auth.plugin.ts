import { oauthProvider } from '@better-auth/oauth-provider';
import type { FactoryProvider } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';

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
      clientPrivileges: ({ action, user }) =>
        READ_ONLY.has(action) ||
        rolesOf(user?.role).includes(SYSTEM_ADMIN_ROLE),
      silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
    });
    return plugin as typeof plugin & BetterAuthPlugin;
  },
  inject: [BETTER_AUTH_CONFIG],
} satisfies FactoryProvider;
