import {
  Inject,
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type Provider,
  type Type,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantEntityManagers } from './tenant-entity-managers';
import { SharedSchemaTenants, TenantSchemas } from './tenant-schemas';
import { TenantInterceptor } from './tenant.interceptor';
import { TenantMiddleware } from './tenant.middleware';
import {
  TENANT_RESOLVER,
  TenantResolverProviders,
  type TenantResolverLike,
} from './tenant.resolver';

export interface TenancyOptions {
  /** Where a tenant's rows live. Default: {@link SharedSchemaTenants} — the connection's own schema. */
  schemas?: Provider<TenantSchemas> | Type<TenantSchemas>;
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
  /** Extra modules the policy or the resolver need — the transport's, typically. */
  imports?: DynamicModule['imports'];
}

/** What `forRoot` was given, so `configure()` can read it without a static to remember it by. */
export const TENANCY_OPTIONS = 'TENANCY_OPTIONS';

/**
 * **Tenancy: the request's tenant, and the entity manager that follows from it.**
 *
 * `TenancyModule.forRoot()` is the whole wiring — the middleware for HTTP, the interceptor for
 * everything else, and the two policies ({@link TenantSchemas}, {@link TENANT_RESOLVER}) that decide
 * what a tenant means here. It is global so a resolver, a handler or a saga can inject
 * {@link TenantEntityManagers} without importing anything.
 *
 * What it does NOT do is put the tenant on the wire: that is the application's request context
 * (`PostRequest.toAttributes()`), because what crosses a broker is what the application calls a
 * request, and this package has no opinion about that.
 */
@Module({})
export class TenancyModule implements NestModule {
  constructor(@Inject(TENANCY_OPTIONS) private readonly options: TenancyOptions) {}

  static forRoot(options: TenancyOptions = {}): DynamicModule {
    return {
      module: TenancyModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        { provide: TENANCY_OPTIONS, useValue: options },
        TenancyModule.schemaProvider(options.schemas),
        ...TenantResolverProviders.for(options.resolver),
        TenantEntityManagers,
        TenantMiddleware,
        { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
      ],
      exports: [TenantEntityManagers, TenantSchemas, TENANT_RESOLVER],
    };
  }

  private static schemaProvider(
    schemas: TenancyOptions['schemas'],
  ): Provider {
    if (!schemas) {
      return { provide: TenantSchemas, useClass: SharedSchemaTenants };
    }
    return typeof schemas === 'function'
      ? { provide: TenantSchemas, useClass: schemas as Type<TenantSchemas> }
      : schemas;
  }

  configure(consumer: MiddlewareConsumer): void {
    if (this.options.http ?? true) {
      consumer.apply(TenantMiddleware).forRoutes('*splat');
    }
  }
}
