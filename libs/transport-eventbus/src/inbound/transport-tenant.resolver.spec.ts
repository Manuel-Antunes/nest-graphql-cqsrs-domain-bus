import type { ExecutionContext } from '@nestjs/common';
import { AsyncContext } from '@nestjs/cqrs';
import { ROOT_TENANT, TENANT_HEADER } from '@nestposts/database';

import {
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
} from '../outbound/event-envelope';
import {
  CorrelatedRequestContext,
  CORRELATION_ID,
  TransportRequestContext,
} from '../request-context';
import { IncomingRequest } from './incoming-request';
import { TransportTenantResolver } from './transport-tenant.resolver';

const envelope = (metadata: Record<string, string>) => ({
  data: { postId: 'p-1' },
  metadata: {
    [TRANSPORT_MESSAGE_TYPE]: 'posts.PostPreCreated#1.0.0',
    [TRANSPORT_IDENTIFIER]: 'message-1',
    [TRANSPORT_ORIGIN]: 'posts-api',
    [CORRELATION_ID]: 'c-1',
    ...metadata,
  },
});

const rpcContext = (metadata: Record<string, string>): ExecutionContext =>
  ({
    getType: () => 'rpc',
    getArgByIndex: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({}) }),
    switchToRpc: () => ({
      getData: () => envelope(metadata),
      getContext: () => ({}),
    }),
  }) as unknown as ExecutionContext;

const httpContext = (headers: Record<string, string>): ExecutionContext =>
  ({
    getType: () => 'http',
    getArgByIndex: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    switchToRpc: () => ({ getData: () => undefined, getContext: () => ({}) }),
  }) as unknown as ExecutionContext;

describe('the tenant of a message', () => {
  const resolver = new TransportTenantResolver(
    new IncomingRequest(new CorrelatedRequestContext()),
  );

  describe('read off the envelope the transport delivered', () => {
    it('answers with the tenant the publishing service put on the request', () => {
      expect(resolver.tenantOf(rpcContext({ [TENANT_HEADER]: 'Acme' }))).toBe(
        'acme',
      );
    });

    it('is the root tenant when the envelope names none', () => {
      expect(resolver.tenantOf(rpcContext({}))).toBe(ROOT_TENANT);
    });

    it('normalizes the word a producer interpolated in place of a missing tenant', () => {
      expect(
        resolver.tenantOf(rpcContext({ [TENANT_HEADER]: 'undefined' })),
      ).toBe(ROOT_TENANT);
    });
  });

  describe('the same resolver still answers for http, because one service serves both', () => {
    it('falls back to the header', () => {
      expect(
        resolver.tenantOf(httpContext({ [TENANT_HEADER]: 'globex' })),
      ).toBe('globex');
    });
  });

  describe('reading a tenant off whatever context class the application rebuilt', () => {
    it('reads the attributes of the generic transport context', () => {
      const context = new TransportRequestContext('c-1', 'm-1', {
        [TENANT_HEADER]: 'acme',
      });

      expect(TransportTenantResolver.tenantCarriedBy(context)).toBe('acme');
    });

    it('reads the attributes an application context declares for the wire', () => {
      class PostRequest extends AsyncContext {
        toAttributes(): Record<string, string> {
          return { [TENANT_HEADER]: 'initech' };
        }
      }

      expect(TransportTenantResolver.tenantCarriedBy(new PostRequest())).toBe(
        'initech',
      );
    });

    it('answers nothing for a context that carries no tenant, and for none at all', () => {
      expect(
        TransportTenantResolver.tenantCarriedBy(
          new TransportRequestContext('c-1'),
        ),
      ).toBeUndefined();
      expect(
        TransportTenantResolver.tenantCarriedBy(new AsyncContext()),
      ).toBeUndefined();
      expect(
        TransportTenantResolver.tenantCarriedBy(undefined),
      ).toBeUndefined();
    });
  });
});
