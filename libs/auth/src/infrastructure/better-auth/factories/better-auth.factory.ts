import type { FactoryProvider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';

import type { AuthConfig } from '../config';
import type { BetterAuth } from '../init-auth';
import { BetterAuthInstance, BetterAuthLogging } from '../init-auth';
import {
  BETTER_AUTH,
  BETTER_AUTH_ADAPTER,
  BETTER_AUTH_CONFIG,
  BETTER_AUTH_PLUGINS,
} from '../tokens';

export const BetterAuthFactory = {
  provide: BETTER_AUTH,
  useFactory: (
    config: AuthConfig,
    adapter: NonNullable<BetterAuthOptions['database']>,
    plugins: BetterAuthPlugin[],
  ): BetterAuth => {
    const logger = new Logger('BetterAuth');
    return BetterAuthInstance.create(config, adapter, plugins, {
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
  inject: [BETTER_AUTH_CONFIG, BETTER_AUTH_ADAPTER, BETTER_AUTH_PLUGINS],
} satisfies FactoryProvider<BetterAuth>;
