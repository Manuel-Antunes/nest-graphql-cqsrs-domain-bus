import type { FactoryProvider } from '@nestjs/common';
import type { JwtOptions } from 'better-auth/plugins';
import { jwt } from 'better-auth/plugins';

import type { AuthConfig } from '../config';
import { BETTER_AUTH_CONFIG } from '../tokens';
import { JWT_BETTER_AUTH_PLUGIN } from './tokens';

export const jwtPluginOptions = (config: Pick<AuthConfig, 'issuer'>) =>
  ({
    jwks: { keyPairConfig: { alg: 'ES256' } },
    jwt: { issuer: config.issuer },
  }) satisfies JwtOptions;

export const JwtBetterAuthPluginProvider = {
  provide: JWT_BETTER_AUTH_PLUGIN,
  useFactory: (config: AuthConfig) => jwt(jwtPluginOptions(config)),
  inject: [BETTER_AUTH_CONFIG],
} satisfies FactoryProvider;
