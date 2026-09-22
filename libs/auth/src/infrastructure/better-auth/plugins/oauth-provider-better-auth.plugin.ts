import type { FactoryProvider } from '@nestjs/common';
import { oauthProvider } from '@better-auth/oauth-provider';
import type { BetterAuthPlugin } from 'better-auth';
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

export const OAuthProviderBetterAuthPluginProvider = {
  provide: OAUTH_PROVIDER_BETTER_AUTH_PLUGIN,
  useFactory: (config: AuthConfig) => {
    const plugin = oauthProvider({
      loginPage: `${config.webUrl}/login`,
      consentPage: `${config.webUrl}/consent`,
      scopes: OAUTH_SCOPES,
    });
    return plugin as typeof plugin & BetterAuthPlugin;
  },
  inject: [BETTER_AUTH_CONFIG],
} satisfies FactoryProvider;
