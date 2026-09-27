import type { IEventHandler } from '@nestjs/cqrs';
import { EventsHandler } from '@nestjs/cqrs';
import type { OutboxEnvelope } from '@nestjs/outbox';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import {
  encodeData,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from '../outbound/message-headers';
import { ingestionOf, isIngested } from '../outbound/transport-metadata';
import { envelopeOf, messageOf, reconstruct } from './event-reconstruction';

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

  it('marks it as ingested under the message id, which is what keeps it from being sent straight back out', () => {
    const event = reconstruct(
      envelope({ postId: 'p-1' }, { [TRANSPORT_ORIGIN]: 'tagging' }),
    );

    expect(isIngested(event)).toBe(true);
    expect(ingestionOf(event)).toMatchObject({
      origin: 'tagging',
      identifier: 'evt-1',
      messageType: 'posts.PostCompleted#1.0.0',
    });
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

  it('reads the message off the envelope, for the inbox to remember', () => {
    expect(
      messageOf(envelope({ postId: 'p-1' }, { [TRANSPORT_ORIGIN]: 'tagging' })),
    ).toMatchObject({
      identifier: 'evt-1',
      origin: 'tagging',
      tags: [{ key: 'postId', value: 'p-1' }],
    });
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
    expect(isIngested(event)).toBe(true);
  });

  it('takes the envelope as a string or a Buffer, as a transporter may hand it over', () => {
    const wire = JSON.stringify(envelope({ postId: 'p-1' }));

    expect(reconstruct(envelopeOf(wire))).toBeInstanceOf(PostCompletedEvent);
    expect(reconstruct(envelopeOf(Buffer.from(wire)))).toBeInstanceOf(
      PostCompletedEvent,
    );
  });
});
