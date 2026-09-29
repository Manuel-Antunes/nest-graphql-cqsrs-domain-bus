import type { DynamicModule, Type } from '@nestjs/common';
import { Module, Scope } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { DatabaseEntities } from '@nestposts/database';
import { DatabaseModule } from '@nestposts/database';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { LoggingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/logging-on-demand-notifications';
import { SoftDeleteModule } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.module';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';

import { authConfig } from '../../config/auth.config';
import { AuthService } from '../../domain/auth/auth.service';
import { IdentityResolver } from '../../domain/auth/identity.resolver';
import { authEntities } from '../persistence/auth-entities';
import { AvatarImages } from './avatar/avatar-images';
import { BetterAuthEmails } from './emails/better-auth-emails';
import {
  BetterAuthAdapterFactory,
  BetterAuthFactory,
  BetterAuthPluginsFactory,
  BetterAuthSecondaryStorageFactory,
} from './factories';
import { UserDatabaseHooks } from './hooks/user-database.hooks';
import { BetterAuthIdentityProvider } from './identity/better-auth-identity.provider';
import { BetterAuthIdentityResolver } from './identity/better-auth-identity.resolver';
import type { BetterAuthPluginProvider } from './plugins/registry';
import { BetterAuthPlugins } from './plugins/registry';
import { BetterAuthService } from './services/better-auth.service';
import { BETTER_AUTH, BETTER_AUTH_SECONDARY_STORAGE } from './tokens';

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
  /** Modules providing what those plugin providers inject. */
  imports?: DynamicModule['imports'];
  /**
   * What sends the emails authentication asks for — verification, reset, magic link, one-time codes.
   * `PublishingOnDemandNotifications` hands them to the process that delivers notifications; the
   * default logs them and sends nothing, which is right for a runtime with no transport.
   */
  notifications?: Type<OnDemandNotifications>;
}

@Module({})
export class BetterAuthModule {
  static forRoot(options: BetterAuthModuleOptions = {}): DynamicModule {
    const {
      plugins = [],
      trailingPlugins = [],
      entities = authEntities,
      imports = [],
      notifications = LoggingOnDemandNotifications,
    } = options;
    const providers = BetterAuthPlugins.providersWith(plugins, trailingPlugins);
    const configuration = ConfigModule.forFeature(authConfig);

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
      imports: [
        configuration,
        ...imports,
        DatabaseModule.forFeature(entities),
        SoftDeleteModule,
      ],
      providers: [
        BetterAuthAdapterFactory,
        BetterAuthSecondaryStorageFactory,
        { provide: OnDemandNotifications, useClass: notifications },
        BetterAuthEmails,
        ...providers,
        BetterAuthPluginsFactory(providers),
        BetterAuthFactory,
        { provide: IdentityResolver, useClass: BetterAuthIdentityResolver },
        {
          provide: AuthService,
          useClass: BetterAuthService,
          scope: Scope.REQUEST,
        },
        { provide: IdentityProvider, useClass: BetterAuthIdentityProvider },
        AvatarImages,
        UserDatabaseHooks,
      ],
      exports: [
        configuration,
        BETTER_AUTH,
        BETTER_AUTH_SECONDARY_STORAGE,
        AuthService,
        IdentityResolver,
        IdentityProvider,
        OnDemandNotifications,
        BetterAuthEmails,
      ],
    };
  }
}
