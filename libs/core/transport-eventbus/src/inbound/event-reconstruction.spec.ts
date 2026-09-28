import type { IEventHandler } from '@nestjs/cqrs';
import { EventsHandler } from '@nestjs/cqrs';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { EventMessages } from '../outbound/event-messages';
import {
  encodeData,
  LEGACY_CAUSATION_ID,
  LEGACY_CORRELATION_ID,
  TRANSPORT_EVENT_ID,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from '../outbound/message-headers';
import { envelopeOf } from './event-reconstruction';

const reconstruct = (envelope: OutboxEnvelope): object =>
  EventMessages.read(envelope).payload;

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
  handle(): void {}
}

describe('reconstructing an event from a message', () => {
  const envelope = (
    body: object,
    headers: Record<string, string> = {},
  ): OutboxEnvelope =>
    JSON.parse(
      JSON.stringify({
        id: 'evt-1',
        topic: 'posts.PostCompleted.p-1',
        key: 'posts/p-1',
        createdAt: 1_790_000_000_000,
        payload: encodeData(body),
        headers: {
          [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCompleted#1.0.0',
          [TRANSPORT_TIMESTAMP]: '2026-09-08T12:00:00.000Z',
          [TRANSPORT_TAGS]: 'postId=p-1',
          ...headers,
        },
      }),
    ) as OutboxEnvelope;

  it('is an instance of the declared class, which is what a handler is registered against', () => {
    const event = reconstruct(
      envelope({
        postId: 'p-1',
        title: 'Nest',
        occurredAt: new Date('2026-09-08T12:00:00.000Z'),
      }),
    );

    expect(event).toBeInstanceOf(PostCompletedEvent);
    expect(PostCompletedHandler).toBeDefined();
  });

  it('brings the fields back, dates included', () => {
    const event = reconstruct(
      envelope({
        postId: 'p-1',
        title: 'Nest',
        occurredAt: new Date('2026-09-08T12:00:00.000Z'),
      }),
    ) as PostCompletedEvent;

    expect(event.postId).toBe('p-1');
    expect(event.title).toBe('Nest');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('is the message it was published as: its identifier, its type, its instant, and the rest of its headers as metadata', () => {
    const message = EventMessages.read(
      envelope(
        { postId: 'p-1' },
        { [TRANSPORT_ORIGIN]: 'tagging', 'x-tenant': 'acme' },
      ),
    );

    expect(message.identifier).toBe('evt-1');
    expect(message.type.toString()).toBe('posts.PostCompleted#1.0.0');
    expect(message.timestamp).toEqual(new Date('2026-09-08T12:00:00.000Z'));
    expect(message.metadata).toEqual({ 'x-tenant': 'acme' });
    expect(
      EventMessages.originOf(envelope({}, { [TRANSPORT_ORIGIN]: 'tagging' })),
    ).toBe('tagging');
  });

  it('takes the identifier of the event, not of the envelope, when a message carries one of its own', () => {
    expect(
      EventMessages.read(
        envelope({ postId: 'p-1' }, { [TRANSPORT_EVENT_ID]: 'evt-original' }),
      ).identifier,
    ).toBe('evt-original');
  });

  it('reads the correlation a producer still wrote under the old keys as the keys Axon names', () => {
    expect(
      EventMessages.read(
        envelope(
          { postId: 'p-1' },
          { [LEGACY_CORRELATION_ID]: 'c-1', [LEGACY_CAUSATION_ID]: 'evt-0' },
        ),
      ).metadata,
    ).toEqual({ correlationId: 'c-1', causationId: 'evt-0' });
  });

  it('resolves the class by qualified name when the version on the wire is another one', () => {
    expect(
      reconstruct(
        envelope(
          { postId: 'p-1' },
          { [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCompleted#9.9.9' },
        ),
      ),
    ).toBeInstanceOf(PostCompletedEvent);
  });

  it('refuses a payload that is not an envelope: the producer is not an outbox', () => {
    expect(() => envelopeOf({ postId: 'p-1' })).toThrow(
      /not an OutboxEnvelope/,
    );
  });

  it('falls back to a class named after an undeclared event, and warns that nothing will handle it', () => {
    const event = reconstruct(
      envelope(
        { postId: 'p-1' },
        { [TRANSPORT_MESSAGE_TYPE]: 'billing.InvoiceIssued#1.0.0' },
      ),
    );

    expect(event).not.toBeInstanceOf(PostCompletedEvent);
    expect(event.constructor.name).toBe('billing.InvoiceIssued#1.0.0');
  });

  it('takes the envelope as a string or a Buffer, as a transporter may hand it over', () => {
    const wire = JSON.stringify(envelope({ postId: 'p-1' }));

    expect(reconstruct(envelopeOf(wire))).toBeInstanceOf(PostCompletedEvent);
    expect(reconstruct(envelopeOf(Buffer.from(wire)))).toBeInstanceOf(
      PostCompletedEvent,
    );
  });
});
