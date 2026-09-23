import type { EnvelopeMetadata } from '../outbound/event-envelope';
import type { AwsEnvelopeMessage } from './aws-message';
import { SqsEventEnvelopeDeserializer } from '../inbound/deserializers/sqs-event-envelope.deserializer';
import {
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
} from '../outbound/event-envelope';
import { AwsEventEnvelopeSerializer } from '../outbound/serializers/aws-event-envelope.serializer';
import { CORRELATION_ID } from '../request-context';
import {
  AWS_MESSAGE_TYPE_ATTRIBUTE,
  AWS_NAMESPACE_ATTRIBUTE,
  AWS_ORIGIN_ATTRIBUTE,
  AWS_QUALIFIED_NAME_ATTRIBUTE,
  AWS_ROUTING_KEY_ATTRIBUTE,
} from './aws-message';

const ROUTING_KEY = 'posts.PostCreated.p-1';

const metadata: EnvelopeMetadata = {
  [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
  [TRANSPORT_IDENTIFIER]: 'evt-1',
  [TRANSPORT_ORIGIN]: 'tagging',
  [TRANSPORT_TAGS]: 'postId=p-1',
  [CORRELATION_ID]: 'corr-1',
  'x-tenant': 'acme',
};

const publish = (
  data: object,
  envelopeMetadata: EnvelopeMetadata = metadata,
): AwsEnvelopeMessage =>
  new AwsEventEnvelopeSerializer().serialize({
    pattern: ROUTING_KEY,
    data: new EventEnvelope(data, envelopeMetadata),
  }) as AwsEnvelopeMessage;

const deliver = (body: unknown, attributes: EnvelopeMetadata = {}) =>
  new SqsEventEnvelopeDeserializer().deserialize(
    JSON.parse(JSON.stringify(body)) as unknown,
    { attributes },
  ) as { pattern: string; data: EventEnvelope<Record<string, unknown>> };

describe('the AWS wire', () => {
  describe('what SNS is given', () => {
    it('lifts the routing facts into message attributes, because a filter policy reads nothing else', () => {
      expect(publish({ postId: 'p-1' }).attributes).toEqual({
        [AWS_ROUTING_KEY_ATTRIBUTE]: ROUTING_KEY,
        [AWS_MESSAGE_TYPE_ATTRIBUTE]: 'posts.PostCreated#2.0.0',
        [AWS_QUALIFIED_NAME_ATTRIBUTE]: 'posts.PostCreated',
        [AWS_NAMESPACE_ATTRIBUTE]: 'posts',
        [AWS_ORIGIN_ATTRIBUTE]: 'tagging',
      });
    });

    it('stays under the ten attributes AWS allows, however much the envelope carries', () => {
      const crowded = {
        ...metadata,
        'traceparent': '00-a-b-01',
        'post-request-post-id': 'p-1',
      };

      expect(
        Object.keys(publish({}, crowded).attributes).length,
      ).toBeLessThanOrEqual(10);
    });

    it('keeps the whole metadata in the body, where there is room for it', () => {
      expect(publish({ postId: 'p-1' }).body.metadata).toEqual(metadata);
    });

    it('keeps the event readable as itself', () => {
      expect(publish({ postId: 'p-1', title: 'Nest' }).body.data).toEqual({
        postId: 'p-1',
        title: 'Nest',
      });
    });
  });

  describe('what the queue reads back', () => {
    it('is the envelope that was published', () => {
      const received = deliver(publish({ postId: 'p-1' }).body);

      expect(received.pattern).toBe(ROUTING_KEY);
      expect(received.data.metadata).toEqual(metadata);
      expect(received.data.messageType).toBe('posts.PostCreated#2.0.0');
      expect(received.data.origin).toBe('tagging');
      expect(received.data.tags).toEqual([{ key: 'postId', value: 'p-1' }]);
    });

    it('brings a Date back as a Date', () => {
      const occurredAt = new Date('2026-09-08T12:00:00.000Z');

      const received = deliver(publish({ occurredAt }).body);

      expect(received.data.data.occurredAt).toBeInstanceOf(Date);
      expect(received.data.data.occurredAt).toEqual(occurredAt);
    });

    it('unwraps an SNS notification, for a subscription without raw message delivery', () => {
      const published = publish({ postId: 'p-1' });
      const notification = {
        Type: 'Notification',
        MessageId: 'sns-1',
        TopicArn: 'arn:aws:sns:us-east-1:000000000000:nestposts-events',
        Message: JSON.stringify(published.body),
        MessageAttributes: { namespace: { Type: 'String', Value: 'posts' } },
      };

      const received = deliver(notification);

      expect(received.pattern).toBe(ROUTING_KEY);
      expect(received.data.metadata).toEqual(metadata);
      expect(received.data.data).toEqual({ postId: 'p-1' });
    });

    it('describes a message somebody else published from its attributes', () => {
      const received = deliver(
        { postId: 'p-1' },
        {
          [AWS_ROUTING_KEY_ATTRIBUTE]: ROUTING_KEY,
          [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
          [TRANSPORT_IDENTIFIER]: 'evt-9',
        },
      );

      expect(received.pattern).toBe(ROUTING_KEY);
      expect(received.data.messageType).toBe('posts.PostCreated#2.0.0');
      expect(received.data.identifier).toBe('evt-9');
      expect(received.data.data).toEqual({ postId: 'p-1' });
    });
  });
});
