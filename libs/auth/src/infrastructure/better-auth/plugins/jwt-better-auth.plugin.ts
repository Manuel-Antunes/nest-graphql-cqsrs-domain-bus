import type { FactoryProvider } from '@nestjs/common';
import { createAuthMiddleware } from 'better-auth/api';
import type { JwtOptions } from 'better-auth/plugins';
import { jwt } from 'better-auth/plugins';

import type { AuthConfig } from '../../../config/auth.config';
import { authConfig } from '../../../config/auth.config';
import { DISCOVERY_CACHE_CONTROL } from '../discovery/discovery-cache';
import { JWT_BETTER_AUTH_PLUGIN } from './tokens';

export const jwtPluginOptions = (config: Pick<AuthConfig, 'issuer'>) =>
  ({
    jwks: { keyPairConfig: { alg: 'ES256' } },
    jwt: { issuer: config.issuer },
  }) satisfies JwtOptions;

/**
 * Better Auth's jwt plugin, with its JWKS cacheable ({@link DISCOVERY_CACHE_CONTROL}): the endpoint
 * sends no `Cache-Control` of its own, so a CDN never kept it and every token validation that fetched
 * it waited on whichever function served `/api/auth/jwks`.
 */
export const cacheableJwt = (options: JwtOptions) => {
  const plugin = jwt(options);
  const jwksPath = options.jwks?.jwksPath ?? '/jwks';
  return {
    ...plugin,
    hooks: {
      ...plugin.hooks,
      after: [
        ...plugin.hooks.after,
        {
          matcher: (context: { path?: string }) => context.path === jwksPath,
          handler: createAuthMiddleware(async (ctx) => {
            ctx.setHeader('Cache-Control', DISCOVERY_CACHE_CONTROL);
          }),
        },
      ],
    },
  };
};

export const JwtBetterAuthPluginProvider = {
  provide: JWT_BETTER_AUTH_PLUGIN,
  useFactory: (config: AuthConfig) => cacheableJwt(jwtPluginOptions(config)),
  inject: [authConfig.KEY],
} satisfies FactoryProvider;
