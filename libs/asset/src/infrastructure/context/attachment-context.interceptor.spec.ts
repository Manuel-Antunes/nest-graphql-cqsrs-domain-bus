import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom, of } from 'rxjs';

import { AttachmentContextRegistry } from '../../domain/context/attachment-context-registry';
import { AttachmentContext } from './attachment-context';
import { AttachmentContextInterceptor } from './attachment-context.interceptor';

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
  handle: () => defer(() => of(AttachmentContext.get())),
});

describe('AttachmentContextInterceptor', () => {
  const interceptor = new AttachmentContextInterceptor();

  afterEach(() => {
    AttachmentContext.clearGlobals();
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
          return AttachmentContext.get();
        }),
    };

    const seen = await firstValueFrom(
      interceptor.intercept(rpcContext({ 'x-tenant': 'acme' }), handler),
    );
    expect(seen).toMatchObject({ tenantId: 'acme' });
  });

  it('steps aside when a scope is already open', async () => {
    const seen = await AttachmentContext.run(
      { tenantId: 'from-middleware' },
      () =>
        firstValueFrom(
          interceptor.intercept(rpcContext({}), reportingHandler()),
        ),
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
    expect(AttachmentContext.isActive()).toBe(false);
  });

  it('is the reader the domain resolver uses', () => {
    AttachmentContext.setGlobals({ tenantId: 'root' });
    expect(AttachmentContextRegistry.read()).toMatchObject({
      tenantId: 'root',
    });
  });
});
