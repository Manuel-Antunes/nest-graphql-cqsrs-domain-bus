import type {
  DynamicModule,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { Inject, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { TenantInterceptor } from './tenant.interceptor';
import { TenantMiddleware } from './tenant.middleware';
import type { TenantResolverLike } from './tenant.resolver';
import { TENANT_RESOLVER, TenantResolverProviders } from './tenant.resolver';
import type { TenantMigrations } from './tenant-entity-manager.service';
import {
  TENANT_MIGRATIONS,
  TenantEntityManagerService,
} from './tenant-entity-manager.service';

export interface TenancyOptions {
  /**
   * The tenant migrations every tenant's schema is brought up to, as MikroORM's `migrations` option —
   * `{ path: join(__dirname, 'migrations', 'tenant') }` beside a bundle, `{ migrationsList }` where
   * there is no directory. Bound to {@link TENANT_MIGRATIONS}, which is what a suite overrides.
   */
  migrations: TenantMigrations;
  /**
   * Where the tenant is read from — a class, an instance, or a plain
   * `(context: ExecutionContext) => string`. A class is registered by this module, so whatever it
   * injects resolves from here and nothing has to be provided from outside.
   * Default: `HeaderTenantResolver`.
   */
  resolver?: TenantResolverLike;
  /**
   * Whether the HTTP middleware is applied. A service with no HTTP port (`apps/tagging`) leaves it
   * off and keeps only the interceptor, which is what its messages go through.
   */
  http?: boolean;
  /** Extra modules the resolver needs — the transport's, typically. */
  imports?: DynamicModule['imports'];
}

/** What `forRoot` was given, so `configure()` can read it without a static to remember it by. */
export const TENANCY_OPTIONS = 'TENANCY_OPTIONS';

/**
 * **Tenancy: the request's tenant, its schema, and the entity manager that follows from it.**
 *
 * `TenancyModule.forRoot({ migrations })` is the whole wiring — the middleware for HTTP, the
 * interceptor for everything else, {@link TenantEntityManagerService} that forks and migrates a
 * tenant's schema, and the resolver that says where the tenant is read from. It is global so a
 * resolver, a handler or a hook can inject the service without importing anything.
 *
 * What it does NOT do is put the tenant on the wire: that is the application's request context
 * (`PostRequest.toAttributes()`), because what crosses a broker is what the application calls a
 * request, and this package has no opinion about that.
 */
@Module({})
export class TenancyModule implements NestModule {
  constructor(
    @Inject(TENANCY_OPTIONS) private readonly options: TenancyOptions,
  ) {}

  static forRoot(options: TenancyOptions): DynamicModule {
    return {
      module: TenancyModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        { provide: TENANCY_OPTIONS, useValue: options },
        { provide: TENANT_MIGRATIONS, useValue: options.migrations },
        ...TenantResolverProviders.for(options.resolver),
        TenantEntityManagerService,
        TenantMiddleware,
        { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
      ],
      exports: [TenantEntityManagerService, TENANT_RESOLVER],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    if (this.options.http ?? true) {
      consumer.apply(TenantMiddleware).forRoutes('*splat');
    }
  }
}
