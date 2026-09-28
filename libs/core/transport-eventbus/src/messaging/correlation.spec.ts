import { UnitOfWork } from '../unit-of-work/unit-of-work';
import { CommandMessage } from './command-message';
import {
  CorrelationDataInterceptor,
  CorrelationDataProvider,
  ForwardedMetadataProvider,
  MessageOriginProvider,
} from './correlation';
import { EventMessage } from './event-message';
import type {
  MessageDispatchInterceptor,
  MessageHandlerInterceptor,
} from './interception';
import { InterceptorChains } from './interception';
import type { Message, Metadata } from './message';

class Placed {}

const handled = (metadata: Metadata = {}) =>
  EventMessage.create(new Placed(), { identifier: 'evt-1', metadata });

describe('correlation data', () => {
  describe("Axon 5's MessageOriginProvider", () => {
    it('starts a chain at the message that has no correlation, and names it as the cause', () => {
      expect(new MessageOriginProvider().correlationDataFor(handled())).toEqual(
        {
          correlationId: 'evt-1',
          causationId: 'evt-1',
        },
      );
    });

    it('keeps the correlation the message carries, and names the message as the cause', () => {
      expect(
        new MessageOriginProvider().correlationDataFor(
          handled({ correlationId: 'c-1', causationId: 'cmd-0' }),
        ),
      ).toEqual({ correlationId: 'c-1', causationId: 'evt-1' });
    });
  });

  it("forwards the application's keys and none of the framework's, the trace or the origin's ids", () => {
    expect(
      new ForwardedMetadataProvider().correlationDataFor(
        handled({
          'x-tenant': 'acme',
          'post-id': 'p-1',
          'cqrs-transport-origin': 'posts-api',
          traceparent: '00-abc-def-01',
          correlationId: 'c-1',
          causationId: 'evt-0',
        }),
      ),
    ).toEqual({ 'x-tenant': 'acme', 'post-id': 'p-1' });
  });

  describe('the interceptor', () => {
    const interceptor = new CorrelationDataInterceptor([
      new MessageOriginProvider(),
      new ForwardedMetadataProvider(),
    ]);

    it('computes it where a message is handled and stamps it on what is dispatched in that context', async () => {
      const unit = new UnitOfWork();
      let dispatched: Message | undefined;
      await unit.executeWithResult((context) =>
        interceptor.interceptOnHandle(
          handled({ correlationId: 'c-1', 'x-tenant': 'acme' }),
          context,
          {
            proceed: async (_message, handling) => {
              dispatched = interceptor.interceptOnDispatch(
                CommandMessage.of(new Placed()),
                handling,
                { proceed: (message) => message },
              );
            },
          },
        ),
      );

      expect(dispatched?.metadata).toEqual({
        correlationId: 'c-1',
        causationId: 'evt-1',
        'x-tenant': 'acme',
      });
    });

    it('wins over a key the dispatcher set itself, as in Axon', async () => {
      const unit = new UnitOfWork();
      let dispatched: Message | undefined;
      await unit.executeWithResult((context) =>
        interceptor.interceptOnHandle(
          handled({ 'x-tenant': 'acme' }),
          context,
          {
            proceed: async (_message, handling) => {
              dispatched = interceptor.interceptOnDispatch(
                CommandMessage.of(new Placed(), { 'x-tenant': 'globex' }),
                handling,
                { proceed: (message) => message },
              );
            },
          },
        ),
      );

      expect(dispatched?.metadata['x-tenant']).toBe('acme');
    });

    it('stamps nothing outside a handled message', () => {
      const message = CommandMessage.of(new Placed());

      expect(
        interceptor.interceptOnDispatch(message, undefined, {
          proceed: (dispatched) => dispatched,
        }),
      ).toBe(message);
    });

    it('skips a provider that fails, and keeps the others', async () => {
      class Broken extends CorrelationDataProvider {
        correlationDataFor(): Metadata {
          throw new Error('broken');
        }
      }
      const tolerant = new CorrelationDataInterceptor([
        new Broken(),
        new MessageOriginProvider(),
      ]);
      let seen: Metadata | undefined;
      const unit = new UnitOfWork();
      await unit.executeWithResult((context) =>
        tolerant.interceptOnHandle(handled(), context, {
          proceed: async (_message, handling) => {
            seen = CorrelationDataInterceptor.of(handling);
          },
        }),
      );

      expect(seen).toEqual({ correlationId: 'evt-1', causationId: 'evt-1' });
    });
  });
});

describe('the interceptor chains', () => {
  const trace: string[] = [];

  beforeEach(() => {
    trace.length = 0;
  });

  it('run the first interceptor outermost, on dispatch and on handle', async () => {
    const dispatching = (name: string): MessageDispatchInterceptor => ({
      interceptOnDispatch: (message, context, chain) => {
        trace.push(`${name} dispatch`);
        return chain.proceed(message.andMetadata({ [name]: 'yes' }), context);
      },
    });
    const handling = (name: string): MessageHandlerInterceptor => ({
      interceptOnHandle: async (message, context, chain) => {
        trace.push(`${name} in`);
        await chain.proceed(message, context);
        trace.push(`${name} out`);
      },
    });

    const dispatched = InterceptorChains.dispatch(
      [dispatching('first'), dispatching('second')],
      handled(),
      undefined,
    );
    const unit = new UnitOfWork();
    await unit.executeWithResult((context) =>
      InterceptorChains.handle(
        [handling('first'), handling('second')],
        handled(),
        context,
        async () => {
          trace.push('handler');
        },
      ),
    );

    expect(dispatched.metadata).toEqual({ first: 'yes', second: 'yes' });
    expect(trace).toEqual([
      'first dispatch',
      'second dispatch',
      'first in',
      'second in',
      'handler',
      'second out',
      'first out',
    ]);
  });
});
