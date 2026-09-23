import type { FactoryProvider } from '@nestjs/common';
import type { JwtOptions } from 'better-auth/plugins';
import { jwt } from 'better-auth/plugins';

import { JWT_BETTER_AUTH_PLUGIN } from './tokens';

export const jwtPluginOptions = {
  jwks: { keyPairConfig: { alg: 'ES256' } },
} satisfies JwtOptions;

export const JwtBetterAuthPluginProvider = {
  provide: JWT_BETTER_AUTH_PLUGIN,
  useFactory: () => jwt(jwtPluginOptions),
} satisfies FactoryProvider;
