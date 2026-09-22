import { type CallHandler, type ExecutionContext, Global, Injectable, Module } from '@nestjs/common';
import { RequestContext } from '@mikro-orm/core';
import { firstValueFrom, of } from 'rxjs';
import { defineEntity, p } from '@mikro-orm/core';
import { type AnyMikroORM, metadataOnly } from '../testing/test-database';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { ROOT_TENANT, TENANT_HEADER } from './tenant';
import { TenancyModule } from './tenancy.module';
import { TenantEntityManagers } from './tenant-entity-managers';
import { SchemaPerTenant, SharedSchemaTenants } from './tenant-schemas';
import { TenantInterceptor } from './tenant.interceptor';
import {
  HeaderTenantResolver,
  TENANT_RESOLVER,
  type TenantResolver,
  TenantResolverProviders,
} from './tenant.resolver';

type Headers = Record<string, string | string[] | undefined>;

const executionContext = (
  type: string,
  parts: { headers?: Headers; graphql?: Headers; rpcContext?: Headers } = {},
): ExecutionContext =>
  ({
    getType: () => type,
    getArgByIndex: (index: number) =>
      index === 2 && parts.graphql ? { req: { headers: parts.graphql } } : undefined,
    switchToHttp: () => ({ getRequest: () => ({ headers: parts.headers }) }),
    switchToRpc: () => ({ getContext: () => parts.rpcContext, getData: () => undefined }),
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
      expect(resolver.tenantOf(executionContext('http', { headers: { [TENANT_HEADER]: 'Acme' } }))).toBe(
        'acme',
      );
    });

    it('a graphql request says it in the same header, on the request Apollo was handed', () => {
      expect(resolver.tenantOf(executionContext('graphql', { graphql: { [TENANT_HEADER]: 'globex' } }))).toBe(
        'globex',
      );
    });

    it('an rpc context may carry it directly', () => {
      expect(
        resolver.tenantOf(executionContext('rpc', { rpcContext: { [TENANT_HEADER]: 'initech' } })),
      ).toBe('initech');
    });

    it('and whoever says nothing is the root tenant', () => {
      expect(resolver.tenantOf(executionContext('http', { headers: {} }))).toBe(ROOT_TENANT);
      expect(resolver.tenantOf(executionContext('ws'))).toBe(ROOT_TENANT);
    });
  });

  describe('the entity manager the tenant names', () => {
    it('shares the connection one when the policy says every tenant does', () => {
      const tenants = new TenantEntityManagers(orm, new SharedSchemaTenants());

      expect(tenants.forTenant('acme')).toBe(orm.em);
    });

    it('binds a schema per tenant, and hands the SAME root back for the same tenant', () => {
      const tenants = new TenantEntityManagers(orm, new SchemaPerTenant('posts'));

      const first = tenants.forTenant('acme');
      const second = tenants.forTenant('acme');

      expect(first).toBe(second);
      expect(first).not.toBe(orm.em);
      expect(first.schema).toBe('posts_acme');
      expect(tenants.forTenant('globex')).not.toBe(first);
    });
  });

  describe('what may be configured as the resolver', () => {
    const tenantFrom = async (resolver: Parameters<typeof TenantResolverProviders.for>[0]) => {
      @Global()
      @Module({ providers: [{ provide: MikroORM, useValue: orm }], exports: [MikroORM] })
      class FakeOrmModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [FakeOrmModule, TenancyModule.forRoot({ resolver, http: false })],
      }).compile();

      const bound = moduleRef.get<TenantResolver>(TENANT_RESOLVER, { strict: false });
      const tenantId = bound.tenantOf(executionContext('http', { headers: { [TENANT_HEADER]: 'acme' } }));
      await moduleRef.close();
      return tenantId;
    };

    it('a plain function, with nothing to inject and no class to hold it', async () => {
      await expect(tenantFrom(() => 'from-a-function')).resolves.toBe('from-a-function');
    });

    it('an instance, handed over ready-made', async () => {
      await expect(tenantFrom({ tenantOf: () => 'from-an-instance' })).resolves.toBe(
        'from-an-instance',
      );
    });

    it('a class, which the module registers itself — so its dependencies resolve from here', async () => {
      @Injectable()
      class DependentResolver implements TenantResolver {
        constructor(private readonly tenants: TenantEntityManagers) {}

        tenantOf(): string {
          return this.tenants ? 'from-an-injected-class' : 'nothing was injected';
        }
      }

      await expect(tenantFrom(DependentResolver)).resolves.toBe('from-an-injected-class');
    });

    it('and nothing at all, which is the header', async () => {
      await expect(tenantFrom(undefined)).resolves.toBe('acme');
    });
  });

  describe('the interceptor', () => {
    const handler = (): CallHandler => ({ handle: () => of('answered') });

    const interceptorFor = (tenantId: string) =>
      new TenantInterceptor(new TenantEntityManagers(orm, new SchemaPerTenant('posts')), {
        tenantOf: () => tenantId,
      });

    it('opens a context for a message, which never passed through the middleware', async () => {
      const seen: (string | undefined)[] = [];
      const interceptor = interceptorFor('acme');
      const next: CallHandler = {
        handle: () => {
          seen.push(RequestContext.getEntityManager()?.schema);
          return of('answered');
        },
      };

      await firstValueFrom(interceptor.intercept(executionContext('rpc'), next));

      expect(seen).toEqual(['posts_acme']);
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

      expect(seen).toEqual(['posts_globex']);
    });

    it('defers to a context that already exists, so one request is never two entity managers', async () => {
      const interceptor = interceptorFor('acme');
      const root = orm.em.fork({ schema: 'posts_root' });

      const seen = await RequestContext.create(root, async () =>
        firstValueFrom(
          interceptor.intercept(executionContext('rpc'), {
            handle: () => of(RequestContext.getEntityManager()?.schema),
          }),
        ),
      );

      expect(seen).toBe('posts_root');
    });
  });
});
