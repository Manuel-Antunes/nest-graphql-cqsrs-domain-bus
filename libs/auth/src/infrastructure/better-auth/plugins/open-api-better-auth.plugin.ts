import type { FactoryProvider } from '@nestjs/common';
import { openAPI } from 'better-auth/plugins';
import { OPEN_API_BETTER_AUTH_PLUGIN } from './tokens';

export const OpenApiBetterAuthPluginProvider = {
  provide: OPEN_API_BETTER_AUTH_PLUGIN,
  useFactory: () => openAPI({ disableDefaultReference: false }),
} satisfies FactoryProvider;
