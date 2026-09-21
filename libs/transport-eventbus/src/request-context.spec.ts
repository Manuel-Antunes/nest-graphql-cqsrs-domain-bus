import { AsyncContext } from '@nestjs/cqrs';
import {
  CAUSATION_ID,
  CORRELATION_ID,
  CorrelatedRequestContext,
  TransportRequestContext,
  correlationIdOf,
} from './request-context';
import type { Ingestion } from './outbound/transport-metadata';

class PostRequest extends AsyncContext {
  constructor(readonly postId: string) {
    super();
  }

  toAttributes(): Record<string, string> {
    return { 'post-id': this.postId };
  }
}

describe('the request context on the wire', () => {
  const codec = new CorrelatedRequestContext();
  const arrivedWith = (metadata: Record<string, string>): Ingestion => ({
    origin: 'tagging',
    identifier: 'evt-1',
    messageType: 'posts.PostCreated#1.0.0',
    metadata,
    tags: [],
  });

  describe('encoding', () => {
    it('writes nothing when there is no request to write', () => {
      expect(codec.encode(undefined, {})).toEqual({});
    });

    it('gives every event of one request the same correlation id', () => {
      const request = new AsyncContext();

      const first = codec.encode(request, {});
      const second = codec.encode(request, {});

      expect(first[CORRELATION_ID]).toBe(second[CORRELATION_ID]);
      expect(first[CORRELATION_ID]).toBe(correlationIdOf(request));
    });

    it('gives two requests two correlation ids', () => {
      expect(codec.encode(new AsyncContext(), {})[CORRELATION_ID]).not.toBe(
        codec.encode(new AsyncContext(), {})[CORRELATION_ID],
      );
    });

    it('carries what the application context says it stands for', () => {
      expect(codec.encode(new PostRequest('p-1'), {})).toMatchObject({ 'post-id': 'p-1' });
    });

    it('keeps the correlation id a context arrived with, however many hops it takes', () => {
      const arrived = new TransportRequestContext('c-1', 'evt-0');

      expect(codec.encode(arrived, {})).toMatchObject({
        [CORRELATION_ID]: 'c-1',
        [CAUSATION_ID]: 'evt-0',
      });
    });
  });

  describe('decoding', () => {
    it('restores a context with the correlation that crossed, and this message as its cause', () => {
      const context = codec.decode(arrivedWith({ [CORRELATION_ID]: 'c-1' }));

      expect(context).toBeInstanceOf(TransportRequestContext);
      expect(context).toMatchObject({ correlationId: 'c-1', causationId: 'evt-1' });
    });

    it('keeps the attributes, so an application can read its own', () => {
      const context = codec.decode(arrivedWith({ [CORRELATION_ID]: 'c-1', 'post-id': 'p-1' }));

      expect((context as TransportRequestContext).attributes).toMatchObject({ 'post-id': 'p-1' });
    });

    it('restores nothing when no request crossed', () => {
      expect(codec.decode(arrivedWith({}))).toBeUndefined();
    });

    it('is an AsyncContext, so the event it publishes answers AsyncContext.of', () => {
      const context = codec.decode(arrivedWith({ [CORRELATION_ID]: 'c-1' }))!;
      const event = {};

      context.attachTo(event);

      expect(AsyncContext.of(event)).toBe(context);
      expect(TransportRequestContext.of(event)).toBe(context);
    });
  });

  describe("an application's own context, rebuilt by contextFor", () => {
    class PostRequestCodec extends CorrelatedRequestContext {
      protected override contextFor(message: Ingestion): AsyncContext | undefined {
        const postId = message.metadata['post-id'];
        return postId ? new PostRequest(postId) : undefined;
      }
    }

    const applicationCodec = new PostRequestCodec();

    it('is what the ingested event is published under', () => {
      const context = applicationCodec.decode(arrivedWith({ 'post-id': 'p-1' }));

      expect(context).toBeInstanceOf(PostRequest);
      expect((context as PostRequest).postId).toBe('p-1');
    });

    it('keeps the correlation id the message arrived with, so one request stays one trace', () => {
      const context = applicationCodec.decode(
        arrivedWith({ 'post-id': 'p-1', [CORRELATION_ID]: 'c-1' }),
      );

      expect(correlationIdOf(context!)).toBe('c-1');
      expect(applicationCodec.encode(context, {})[CORRELATION_ID]).toBe('c-1');
    });

    it('falls back to the generic context when the message says nothing this application knows', () => {
      expect(applicationCodec.decode(arrivedWith({ [CORRELATION_ID]: 'c-2' }))).toBeInstanceOf(
        TransportRequestContext,
      );
    });
  });
});