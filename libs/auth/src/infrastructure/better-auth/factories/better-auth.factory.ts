import type { FactoryProvider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type {
  BetterAuthOptions,
  BetterAuthPlugin,
  SecondaryStorage,
} from 'better-auth';

import type { AuthConfig } from '../../../config/auth.config';
import { authConfig } from '../../../config/auth.config';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import type { BetterAuth } from '../init-auth';
import { BetterAuthInstance, BetterAuthLogging } from '../init-auth';
import {
  BETTER_AUTH,
  BETTER_AUTH_ADAPTER,
  BETTER_AUTH_PLUGINS,
  BETTER_AUTH_SECONDARY_STORAGE,
} from '../tokens';

export const BetterAuthFactory = {
  provide: BETTER_AUTH,
  useFactory: (
    config: AuthConfig,
    adapter: NonNullable<BetterAuthOptions['database']>,
    plugins: BetterAuthPlugin[],
    emails: BetterAuthEmails,
    secondaryStorage: SecondaryStorage | null,
  ): BetterAuth => {
    const logger = new Logger('BetterAuth');
    return BetterAuthInstance.create(config, adapter, plugins, emails, {
      secondaryStorage,
      logger: BetterAuthLogging.through((level, message, ...args) => {
        const write = (
          logger as unknown as Record<
            string,
            (msg: string, ...rest: unknown[]) => void
          >
        )[level];
        write?.call(logger, message, ...args);
      }),
    }) as unknown as BetterAuth;
  },
  inject: [
    authConfig.KEY,
    BETTER_AUTH_ADAPTER,
    BETTER_AUTH_PLUGINS,
    BetterAuthEmails,
    BETTER_AUTH_SECONDARY_STORAGE,
  ],
} satisfies FactoryProvider<BetterAuth>;
