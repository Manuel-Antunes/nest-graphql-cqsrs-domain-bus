import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import {
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
  encodeData,
} from '../outbound/event-envelope';
import { ingestionOf, isIngested } from '../outbound/transport-metadata';
import { envelopeFrom, reconstruct, reconstructEvent } from './event-reconstruction';

@EventType({ namespace: 'posts', tags: ['postId'] })
class PostCompletedEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
    readonly occurredAt: Date,
  ) {}
}

@EventsHandler(PostCompletedEvent)
class PostCompletedHandler implements IEventHandler<PostCompletedEvent> {
  handle(): void {
    // Declared only so @nestjs/cqrs stamps its event id on the class.
  }
}

describe('reconstructing an event from a message', () => {
  const envelope = (body: object, metadata: Record<string, string> = {}) =>
    JSON.parse(
      JSON.stringify({
        data: encodeData(body),
        metadata: {
          [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCompleted#1.0.0',
          [TRANSPORT_IDENTIFIER]: 'evt-1',
          [TRANSPORT_TIMESTAMP]: '2026-09-08T12:00:00.000Z',
          [TRANSPORT_TAGS]: 'postId=p-1',
          ...metadata,
        },
      }),
    ) as object;

  it('is an instance of the declared class, which is what a handler is registered against', () => {
    const event = reconstructEvent(
      envelope({ postId: 'p-1', title: 'Nest', occurredAt: new Date('2026-09-08T12:00:00.000Z') }),
    );

    expect(event).toBeInstanceOf(PostCompletedEvent);
    expect(PostCompletedHandler).toBeDefined();
  });

  it('brings the fields back, dates included', () => {
    const event = reconstructEvent(
      envelope({ postId: 'p-1', title: 'Nest', occurredAt: new Date('2026-09-08T12:00:00.000Z') }),
    ) as PostCompletedEvent;

    expect(event.postId).toBe('p-1');
    expect(event.title).toBe('Nest');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('marks it as ingested, which is what keeps it from being sent straight back out', () => {
    const event = reconstructEvent(envelope({ postId: 'p-1' }, { [TRANSPORT_ORIGIN]: 'tagging' }));

    expect(isIngested(event)).toBe(true);
    expect(ingestionOf(event)).toMatchObject({
      origin: 'tagging',
      identifier: 'evt-1',
      messageType: 'posts.PostCompleted#1.0.0',
    });
  });

  it('resolves the class by qualified name when the version on the wire is another one', () => {
    const wire = envelope({ postId: 'p-1' }) as { metadata: Record<string, string> };
    wire.metadata[TRANSPORT_MESSAGE_TYPE] = 'posts.PostCompleted#9.9.9';

    expect(reconstructEvent(wire)).toBeInstanceOf(PostCompletedEvent);
  });

  it("reads upstream's shape, resolving the class by its local name", () => {
    const event = reconstructEvent({
      eventName: 'PostCompleted',
      payload: { postId: 'p-2', title: 'from upstream' },
    }) as PostCompletedEvent;

    expect(event).toBeInstanceOf(PostCompletedEvent);
    expect(event.postId).toBe('p-2');
  });

  it("also reads upstream's shape under the class's own name", () => {
    expect(
      reconstructEvent({ eventName: 'PostCompletedEvent', payload: { postId: 'p-3' } }),
    ).toBeInstanceOf(PostCompletedEvent);
  });

  it('reads the envelope off the message, for the inbox to remember', () => {
    const read = envelopeFrom(envelope({ postId: 'p-1' }, { [TRANSPORT_ORIGIN]: 'tagging' }));

    expect(read.identifier).toBe('evt-1');
    expect(read.origin).toBe('tagging');
    expect(read.tags).toEqual([{ key: 'postId', value: 'p-1' }]);
  });

  it('takes an envelope the transport already read, without decoding it twice', () => {
    const event = reconstruct(
      new EventEnvelope({ postId: 'p-1' }, { [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCompleted#1.0.0' }),
    );

    expect(event).toBeInstanceOf(PostCompletedEvent);
  });

  it('refuses a body with no message type: the transport was wired without a deserializer', () => {
    expect(() => reconstructEvent({ postId: 'p-1' })).toThrow(/not an envelope/);
  });

  it('falls back to a class named after an undeclared event, and warns that nothing will handle it', () => {
    const wire = envelope({ postId: 'p-1' }) as { metadata: Record<string, string> };
    wire.metadata[TRANSPORT_MESSAGE_TYPE] = 'billing.InvoiceIssued#1.0.0';

    const event = reconstructEvent(wire);

    expect(event).not.toBeInstanceOf(PostCompletedEvent);
    expect(event.constructor.name).toBe('billing.InvoiceIssued#1.0.0');
    expect(isIngested(event)).toBe(true);
  });

  it('takes the message as a string or a Buffer, as a transporter may hand it over', () => {
    const wire = JSON.stringify(envelope({ postId: 'p-1' }));

    expect(reconstructEvent(wire)).toBeInstanceOf(PostCompletedEvent);
    expect(reconstructEvent(Buffer.from(wire))).toBeInstanceOf(PostCompletedEvent);
  });
});
