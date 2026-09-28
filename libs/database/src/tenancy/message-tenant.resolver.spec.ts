import type { ExecutionContext } from '@nestjs/common';

import { ROOT_TENANT, TENANT_HEADER } from './tenant';
import { MessageTenantResolver } from './tenant.resolver';

const envelope = (headers: Record<string, string>) => ({
  id: 'message-1',
  topic: 'posts.PostPreCreated',
  key: 'posts/p-1',
  createdAt: 1_790_000_000_000,
  payload: { postId: 'p-1' },
  headers: {
    'cqrs-transport-message-type': 'posts.PostPreCreated#1.0.0',
    'cqrs-transport-origin': 'posts-api',
    ...headers,
  },
});

const rpcContext = (data: unknown): ExecutionContext =>
  ({
    getType: () => 'rpc',
    getArgByIndex: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({}) }),
    switchToRpc: () => ({ getData: () => data, getContext: () => ({}) }),
  }) as unknown as ExecutionContext;

const httpContext = (headers: Record<string, string>): ExecutionContext =>
  ({
    getType: () => 'http',
    getArgByIndex: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    switchToRpc: () => ({ getData: () => undefined, getContext: () => ({}) }),
  }) as unknown as ExecutionContext;

describe('the tenant of a message', () => {
  const resolver = new MessageTenantResolver();

  describe('read off the envelope the transport delivered', () => {
    it('answers with the tenant the publishing service put on the message', () => {
      expect(
        resolver.tenantOf(rpcContext(envelope({ [TENANT_HEADER]: 'Acme' }))),
      ).toBe('acme');
    });

    it('is the root tenant when the envelope names none', () => {
      expect(resolver.tenantOf(rpcContext(envelope({})))).toBe(ROOT_TENANT);
    });

    it('normalizes the word a producer interpolated in place of a missing tenant', () => {
      expect(
        resolver.tenantOf(
          rpcContext(envelope({ [TENANT_HEADER]: 'undefined' })),
        ),
      ).toBe(ROOT_TENANT);
    });

    it('reads an envelope handed over as a string or a Buffer', () => {
      const wire = JSON.stringify(envelope({ [TENANT_HEADER]: 'initech' }));

      expect(resolver.tenantOf(rpcContext(wire))).toBe('initech');
      expect(resolver.tenantOf(rpcContext(Buffer.from(wire)))).toBe('initech');
    });

    it('answers the root tenant for a payload that is not an envelope at all', () => {
      expect(resolver.tenantOf(rpcContext('not json'))).toBe(ROOT_TENANT);
      expect(resolver.tenantOf(rpcContext(undefined))).toBe(ROOT_TENANT);
    });
  });

  it('falls back to the header for HTTP, because one service serves both', () => {
    expect(resolver.tenantOf(httpContext({ [TENANT_HEADER]: 'globex' }))).toBe(
      'globex',
    );
  });
});
