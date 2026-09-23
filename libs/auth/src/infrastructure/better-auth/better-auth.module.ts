import type { DynamicModule } from '@nestjs/common';
import type { DatabaseEntities } from '@nestposts/database';
import { Module, Scope } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';

import type { AuthConfig } from './config';
import type { BetterAuthPluginProvider } from './plugins/registry';
import { AuthService } from '../../domain/auth/auth.service';
import { authEntities } from '../persistence/auth-entities';
import {
  BetterAuthAdapterFactory,
  BetterAuthConfigFactory,
  BetterAuthFactory,
  BetterAuthPluginsFactory,
} from './factories';
import { BetterAuthIdentityProvider } from './identity/better-auth-identity.provider';
import { BetterAuthPlugins } from './plugins/registry';
import { BetterAuthService } from './services/better-auth.service';
import { BETTER_AUTH, BETTER_AUTH_CONFIG } from './tokens';

export interface BetterAuthModuleOptions {
  /**
   * Plugin providers a module built on this one contributes, registered BEFORE the core ones —
   * `@better-auth/oauth-provider` resolves the jwt plugin from context, and cookie plugins have to
   * come last.
   */
  plugins?: readonly BetterAuthPluginProvider[];
  /**
   * Every table this system's authentication owns. Defaults to Better Auth's own, generated with the
   * core plugins alone — a module that contributes a plugin composes the list instead
   * (`OrganizationEntities.withAuth()`), because a plugin can add both tables AND columns.
   */
  entities?: DatabaseEntities;
  /**
   * Plugin providers registered AFTER the core ones. Better Auth requires cookie plugins last, which
   * is where `nextCookies()` goes.
   */
  trailingPlugins?: readonly BetterAuthPluginProvider[];
  /** What this composition root overrides on the configuration read from the environment. */
  config?: Partial<AuthConfig>;
  /** Modules providing what those plugin providers inject. */
  imports?: DynamicModule['imports'];
}

@Module({})
export class BetterAuthModule {
  static forRoot(options: BetterAuthModuleOptions = {}): DynamicModule {
    const {
      plugins = [],
      trailingPlugins = [],
      entities = authEntities,
      imports = [],
    } = options;
    const providers = BetterAuthPlugins.providersWith(plugins, trailingPlugins);

    return {
      module: BetterAuthModule,
      /**
       * Global, because there is exactly ONE Better Auth instance per process and everything that
       * authenticates needs it: the application layer's provisioning, the organization module's
       * service, the interfaces layer's pipes. The alternative is threading this dynamic module
       * through every importer, and re-registering it anywhere would build a SECOND instance — a
       * second set of plugins, a second JWKS, and sessions one half issues that the other rejects.
       */
      global: true,
      imports: [...imports, DatabaseModule.forFeature(entities)],
      providers: [
        BetterAuthConfigFactory.with(options.config),
        BetterAuthAdapterFactory,
        ...providers,
        BetterAuthPluginsFactory(providers),
        BetterAuthFactory,
        {
          provide: AuthService,
          useClass: BetterAuthService,
          scope: Scope.REQUEST,
        },
        { provide: IdentityProvider, useClass: BetterAuthIdentityProvider },
      ],
      exports: [BETTER_AUTH, BETTER_AUTH_CONFIG, AuthService, IdentityProvider],
    };
  }
}
