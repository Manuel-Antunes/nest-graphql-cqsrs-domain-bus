import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom, of } from 'rxjs';

import { AssetContextRegistry } from '../../domain/context/asset-context-registry';
import { AssetContext } from '../context/asset-context';
import { AssetContextInterceptor } from './asset-context.interceptor';

const httpContext = (headers: Record<string, unknown>) =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

const rpcContext = (ctx: Record<string, unknown>) =>
  ({
    getType: () => 'rpc',
    switchToRpc: () => ({ getContext: () => ctx }),
  }) as unknown as ExecutionContext;

const reportingHandler = (): CallHandler => ({
  handle: () => defer(() => of(AssetContext.get())),
});

describe('AssetContextInterceptor', () => {
  const interceptor = new AssetContextInterceptor();

  afterEach(() => {
    AssetContext.clearGlobals();
  });

  it('scopes an HTTP call from the x-tenant header', async () => {
    const seen = await firstValueFrom(
      interceptor.intercept(
        httpContext({ 'x-tenant': 'acme' }),
        reportingHandler(),
      ),
    );
    expect(seen).toMatchObject({ tenantId: 'acme' });
  });

  it('scopes an RPC call from the MCP request _meta', async () => {
    const seen = await firstValueFrom(
      interceptor.intercept(
        rpcContext({ mcpRequest: { params: { _meta: { tenantId: 'acme' } } } }),
        reportingHandler(),
      ),
    );
    expect(seen).toMatchObject({ tenantId: 'acme' });
  });

  it('scopes an RPC call from an x-tenant on the rpc context', async () => {
    const seen = await firstValueFrom(
      interceptor.intercept(
        rpcContext({ 'x-tenant': 'acme' }),
        reportingHandler(),
      ),
    );
    expect(seen).toMatchObject({ tenantId: 'acme' });
  });

  it('falls back to root when the transport carries no tenant', async () => {
    const seen = await firstValueFrom(
      interceptor.intercept(rpcContext({}), reportingHandler()),
    );
    expect(seen).toMatchObject({ tenantId: 'root' });
  });

  it('keeps the scope open for async work inside the handler', async () => {
    const handler: CallHandler = {
      handle: () =>
        defer(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return AssetContext.get();
        }),
    };

    const seen = await firstValueFrom(
      interceptor.intercept(rpcContext({ 'x-tenant': 'acme' }), handler),
    );
    expect(seen).toMatchObject({ tenantId: 'acme' });
  });

  it('steps aside when a scope is already open', async () => {
    const seen = await AssetContext.run({ tenantId: 'from-middleware' }, () =>
      firstValueFrom(interceptor.intercept(rpcContext({}), reportingHandler())),
    );
    expect(seen).toMatchObject({ tenantId: 'from-middleware' });
  });

  it('closes the scope once the call is done', async () => {
    await firstValueFrom(
      interceptor.intercept(
        rpcContext({ 'x-tenant': 'acme' }),
        reportingHandler(),
      ),
    );
    expect(AssetContext.isActive()).toBe(false);
  });

  it('is the reader the domain resolver uses', () => {
    AssetContext.setGlobals({ tenantId: 'root' });
    expect(AssetContextRegistry.read()).toMatchObject({ tenantId: 'root' });
  });
});
