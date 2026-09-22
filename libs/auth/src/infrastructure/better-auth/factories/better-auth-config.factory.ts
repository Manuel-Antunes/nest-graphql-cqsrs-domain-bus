import type { FactoryProvider } from '@nestjs/common';
import { type AuthConfig, AuthConfiguration } from '../config';
import { BETTER_AUTH_CONFIG } from '../tokens';

export class BetterAuthConfigFactory {
  /**
   * The configuration, from the environment, with whatever the composition root overrides.
   *
   * `apps/web` is why the overrides exist: it holds the same Better Auth, but its `baseUrl` is its
   * OWN origin — the cookie has to belong to the origin the browser is talking to.
   */
  static with(overrides: Partial<AuthConfig> = {}): FactoryProvider<AuthConfig> {
    return {
      provide: BETTER_AUTH_CONFIG,
      useFactory: (): AuthConfig => ({ ...AuthConfiguration.fromEnvironment(), ...overrides }),
    };
  }
}
