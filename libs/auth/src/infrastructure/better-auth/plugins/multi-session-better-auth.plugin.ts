import type { FactoryProvider } from '@nestjs/common';
import { multiSession } from 'better-auth/plugins';

import { MULTI_SESSION_BETTER_AUTH_PLUGIN } from './tokens';

export const MultiSessionBetterAuthPluginProvider = {
  provide: MULTI_SESSION_BETTER_AUTH_PLUGIN,
  useFactory: () => multiSession(),
} satisfies FactoryProvider;
