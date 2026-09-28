import { AsyncContext } from '@nestjs/cqrs';

import { EventMessage } from './messaging/event-message';
import type { Message } from './messaging/message';
import type { ContextAttributes } from './request-context';
import {
  DefaultRequestContextCodec,
  TransportRequestContext,
} from './request-context';

class TenantRequest extends AsyncContext implements ContextAttributes {
  constructor(readonly tenantId: string) {
    super();
  }

  toAttributes(): Record<string, string> {
    return { 'x-tenant': this.tenantId };
  }
}

class Arrived {}

const arrived = (metadata: Record<string, string>) =>
  EventMessage.create(new Arrived(), { identifier: 'evt-1', metadata });

describe("@nestjs/cqrs's request, and a message's metadata", () => {
  const codec = new DefaultRequestContextCodec();

  describe('from a request', () => {
    it('is what the request says it stands for', () => {
      expect(codec.toMetadata(new TenantRequest('acme'))).toEqual({
        'x-tenant': 'acme',
      });
    });

    it('is nothing for no request, or for one that says nothing', () => {
      expect(codec.toMetadata(undefined)).toEqual({});
      expect(codec.toMetadata(new AsyncContext())).toEqual({});
    });
  });

  describe('from a message', () => {
    it('is a TransportRequestContext holding the message, so a handler of it answers AsyncContext.of', () => {
      const message = arrived({ 'x-tenant': 'acme', correlationId: 'c-1' });

      const context = codec.fromMessage(message);

      expect(context).toBeInstanceOf(TransportRequestContext);
      expect(context).toBeInstanceOf(AsyncContext);
      expect((context as TransportRequestContext).metadata).toEqual(
        message.metadata,
      );
    });

    it('hands onward only the application keys, never the framework, the trace or the origin ids', () => {
      const context = codec.fromMessage(
        arrived({
          'x-tenant': 'acme',
          'cqrs-transport-origin': 'posts-api',
          traceparent: '00-abc-def-01',
          correlationId: 'c-1',
        }),
      ) as TransportRequestContext;

      expect(context.toAttributes()).toEqual({ 'x-tenant': 'acme' });
    });

    it('is nothing for a message that says nothing', () => {
      expect(codec.fromMessage(arrived({}))).toBeUndefined();
    });

    it("is the application's own request, when it knows how to rebuild one", () => {
      class TenantCodec extends DefaultRequestContextCodec {
        protected override contextFor(message: Message) {
          const tenant = message.metadata['x-tenant'];
          return tenant ? new TenantRequest(tenant) : undefined;
        }
      }

      const rebuilt = new TenantCodec().fromMessage(
        arrived({ 'x-tenant': 'acme' }),
      );
      expect(rebuilt).toBeInstanceOf(TenantRequest);
      expect((rebuilt as TenantRequest).tenantId).toBe('acme');
      expect(
        new TenantCodec().fromMessage(arrived({ other: 'x' })),
      ).toBeInstanceOf(TransportRequestContext);
    });
  });
});
