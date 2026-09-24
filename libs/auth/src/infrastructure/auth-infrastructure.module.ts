import { MikroORM, RequestContext } from '@mikro-orm/core';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { AuthModule as NestBetterAuthModule } from '@thallesp/nestjs-better-auth';

import type { BetterAuthModuleOptions } from './better-auth/better-auth.module';
import { BetterAuthModule } from './better-auth/better-auth.module';
import type { BetterAuth } from './better-auth/init-auth';
import { BETTER_AUTH } from './better-auth/tokens';

/**
 * **Authentication, installed**: the Better Auth instance, the `/api/auth/*` surface and the global
 * guard.
 *
 * It takes the same options as {@link BetterAuthModule} and passes them through, so a module built on
 * top of this one — `@nestposts/organizations` — contributes its plugin and its tables in one place,
 * at the composition root, without this package ever naming it.
 */
export interface AuthInfrastructureModuleOptions
  extends BetterAuthModuleOptions {
  /**
   * Whether this application SERVES `/api/auth/*`. On by default; a service that only needs to know
   * who is calling — a subgraph behind the gateway — turns it off and keeps the global guard, which
   * reads the session through the same Better Auth instance either way.
   */
  readonly routes?: boolean;
}

@Module({})
export class AuthInfrastructureModule {
  static forRoot({
    routes = true,
    ...options
  }: AuthInfrastructureModuleOptions = {}): DynamicModule {
    const betterAuth = BetterAuthModule.forRoot(options);

    return {
      module: AuthInfrastructureModule,
      imports: [
        betterAuth,
        NestBetterAuthModule.forRootAsync({
          disableControllers: !routes,
          imports: [betterAuth],
          inject: [BETTER_AUTH, MikroORM],
          useFactory: (auth: BetterAuth, orm: MikroORM) => ({
            auth,
            middleware: (
              _request: unknown,
              _response: unknown,
              next: () => void,
            ) => RequestContext.create(orm.em, next),
          }),
        }),
      ],
      exports: [betterAuth],
    };
  }
}
