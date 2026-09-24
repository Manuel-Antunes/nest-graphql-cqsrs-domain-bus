import { defineEntity, MikroORM, p, RequestContext } from '@mikro-orm/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Global, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { firstValueFrom, of } from 'rxjs';

import type { AnyMikroORM } from '../testing/test-database';
import { metadataOnly } from '../testing/test-database';
import { TenancyModule } from './tenancy.module';
import { ROOT_TENANT, TENANT_HEADER, Tenant } from './tenant';
import { TenantInterceptor } from './tenant.interceptor';
import type { TenantResolver } from './tenant.resolver';
import {
  HeaderTenantResolver,
  TENANT_RESOLVER,
  TenantResolverProviders,
} from './tenant.resolver';
import { TenantEntityManagerService } from './tenant-entity-manager.service';

type Headers = Record<string, string | string[] | undefined>;

const executionContext = (
  type: string,
  parts: { headers?: Headers; graphql?: Headers; rpcContext?: Headers } = {},
): ExecutionContext =>
  ({
    getType: () => type,
    getArgByIndex: (index: number) =>
      index === 2 && parts.graphql
        ? { req: { headers: parts.graphql } }
        : undefined,
    switchToHttp: () => ({ getRequest: () => ({ headers: parts.headers }) }),
    switchToRpc: () => ({
      getContext: () => parts.rpcContext,
      getData: () => undefined,
    }),
  }) as unknown as ExecutionContext;

class Anything {
  id!: string;
}

const AnythingSchema = defineEntity({
  class: Anything,
  tableName: 'anything',
  properties: { id: p.string().primary() },
});

describe('putting a request inside its tenant', () => {
  let orm: AnyMikroORM;

  beforeAll(async () => {
    orm = await metadataOnly([AnythingSchema]);
  });

  afterAll(() => orm.close(true));

  describe('reading the tenant off the transport', () => {
    const resolver = new HeaderTenantResolver();

    it('an http request says it in a header', () => {
      expect(
        resolver.tenantOf(
          executionContext('http', { headers: { [TENANT_HEADER]: 'Acme' } }),
        ),
      ).toBe('acme');
    });

    it('a graphql request says it in the same header, on the request Apollo was handed', () => {
      expect(
        resolver.tenantOf(
          executionContext('graphql', {
            graphql: { [TENANT_HEADER]: 'globex' },
          }),
        ),
      ).toBe('globex');
    });

    it('an rpc context may carry it directly', () => {
      expect(
        resolver.tenantOf(
          executionContext('rpc', {
            rpcContext: { [TENANT_HEADER]: 'initech' },
          }),
        ),
      ).toBe('initech');
    });

    it('and whoever says nothing is the root tenant', () => {
      expect(resolver.tenantOf(executionContext('http', { headers: {} }))).toBe(
        ROOT_TENANT,
      );
      expect(resolver.tenantOf(executionContext('ws'))).toBe(ROOT_TENANT);
    });
  });

  describe('what may be configured as the resolver', () => {
    const tenantFrom = async (
      resolver: Parameters<typeof TenantResolverProviders.for>[0],
    ) => {
      @Global()
      @Module({
        providers: [{ provide: MikroORM, useValue: orm }],
        exports: [MikroORM],
      })
      class FakeOrmModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [
          FakeOrmModule,
          TenancyModule.forRoot({ resolver, http: false, migrations: {} }),
        ],
      }).compile();

      const bound = moduleRef.get<TenantResolver>(TENANT_RESOLVER, {
        strict: false,
      });
      const tenantId = bound.tenantOf(
        executionContext('http', { headers: { [TENANT_HEADER]: 'acme' } }),
      );
      await moduleRef.close();
      return tenantId;
    };

    it('a plain function, with nothing to inject and no class to hold it', async () => {
      await expect(tenantFrom(() => 'from-a-function')).resolves.toBe(
        'from-a-function',
      );
    });

    it('an instance, handed over ready-made', async () => {
      await expect(
        tenantFrom({ tenantOf: () => 'from-an-instance' }),
      ).resolves.toBe('from-an-instance');
    });

    it('a class, which the module registers itself — so its dependencies resolve from here', async () => {
      @Injectable()
      class DependentResolver implements TenantResolver {
        constructor(private readonly tenants: TenantEntityManagerService) {}

        tenantOf(): string {
          return this.tenants
            ? 'from-an-injected-class'
            : 'nothing was injected';
        }
      }

      await expect(tenantFrom(DependentResolver)).resolves.toBe(
        'from-an-injected-class',
      );
    });

    it('and nothing at all, which is the header', async () => {
      await expect(tenantFrom(undefined)).resolves.toBe('acme');
    });
  });

  describe('the interceptor', () => {
    const _handler = (): CallHandler => ({ handle: () => of('answered') });

    const migrated: string[] = [];
    const tenants = {
      createAndMigrateTenantEntityManager: async (tenantId: string) => {
        migrated.push(tenantId);
        return orm.em.fork({ schema: Tenant.schemaOf(tenantId) });
      },
    } as unknown as TenantEntityManagerService;

    const interceptorFor = (tenantId: string) =>
      new TenantInterceptor(tenants, { tenantOf: () => tenantId });

    beforeEach(() => {
      migrated.length = 0;
    });

    it('opens a context for a message, on its tenant’s migrated schema', async () => {
      const seen: (string | undefined)[] = [];
      const interceptor = interceptorFor('acme');
      const next: CallHandler = {
        handle: () => {
          seen.push(RequestContext.getEntityManager()?.schema);
          return of('answered');
        },
      };

      await firstValueFrom(
        interceptor.intercept(executionContext('rpc'), next),
      );

      expect(seen).toEqual(['tenant_acme']);
      expect(migrated).toEqual(['acme']);
    });

    it('reads the tenant through the token, whatever was bound to it', async () => {
      const interceptor = interceptorFor('globex');
      const seen: (string | undefined)[] = [];

      await firstValueFrom(
        interceptor.intercept(executionContext('rpc'), {
          handle: () => {
            seen.push(RequestContext.getEntityManager()?.schema);
            return of('answered');
          },
        }),
      );

      expect(seen).toEqual(['tenant_globex']);
    });

    it('defers to a context that already exists, so one request is never two entity managers', async () => {
      const interceptor = interceptorFor('acme');
      const root = orm.em.fork({ schema: 'tenant_root' });

      const seen = await RequestContext.create(root, async () =>
        firstValueFrom(
          interceptor.intercept(executionContext('rpc'), {
            handle: () => of(RequestContext.getEntityManager()?.schema),
          }),
        ),
      );

      expect(seen).toBe('tenant_root');
      expect(migrated).toEqual([]);
    });
  });
});
