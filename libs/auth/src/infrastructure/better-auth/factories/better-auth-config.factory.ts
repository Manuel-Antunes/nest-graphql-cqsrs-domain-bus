import type { InjectionToken, Provider } from '@nestjs/common';

import { AuthConfiguration } from '../config';
import { BETTER_AUTH_CONFIG } from '../tokens';

export class BetterAuthConfigFactory {
  /**
   * The configuration: the one the application provides under `config` — its `registerAs('auth')`
   * key, which builds it with {@link AuthConfiguration.fromEnvironment} and whatever that application
   * overrides (`apps/web` puts its OWN origin in `baseUrl`, because the cookie has to belong to the
   * origin the browser is talking to). Without one, the environment's, as read by that same parser.
   */
  static from(config?: InjectionToken): Provider {
    return config
      ? { provide: BETTER_AUTH_CONFIG, useExisting: config }
      : {
          provide: BETTER_AUTH_CONFIG,
          useFactory: () => AuthConfiguration.fromEnvironment(),
        };
  }
}
