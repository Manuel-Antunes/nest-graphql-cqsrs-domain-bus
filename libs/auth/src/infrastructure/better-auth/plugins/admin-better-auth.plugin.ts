import type { FactoryProvider } from '@nestjs/common';
import { admin } from 'better-auth/plugins';

import { systemAccessControl, systemRoles } from '../access';
import { ADMIN_BETTER_AUTH_PLUGIN } from './tokens';

export const AdminBetterAuthPluginProvider = {
  provide: ADMIN_BETTER_AUTH_PLUGIN,
  useFactory: () => admin({ ac: systemAccessControl, roles: systemRoles }),
} satisfies FactoryProvider;
