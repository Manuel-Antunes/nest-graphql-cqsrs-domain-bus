import type { EnvelopeMetadata } from '../outbound/event-envelope';
import type { AwsMessageBody } from './aws-message';
import {
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
} from '../outbound/event-envelope';
import { AwsEventEnvelopeSerializer } from '../outbound/serializers/aws-event-envelope.serializer';
import { SnsClientProxy } from './sns-client.proxy';
import { SnsRecordBuilder } from './sns-record.builder';

const TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:nestposts-events';

const metadata: EnvelopeMetadata = {
  [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
  [TRANSPORT_IDENTIFIER]: 'evt-1',
};

interface PublishedInput {
  Message: string;
  MessageAttributes: Record<string, { DataType: string; StringValue: string }>;
}

class FakeSns {
  readonly published: PublishedInput[] = [];

  send(command: { input: PublishedInput }): Promise<unknown> {
    this.published.push(command.input);
    return Promise.resolve({});
  }

  destroy(): void {}
}

const publish = async (data: unknown): Promise<PublishedInput> => {
  const sns = new FakeSns();
  const proxy = new SnsClientProxy({
    topicArn: TOPIC_ARN,
    client: sns as never,
    serializer: new AwsEventEnvelopeSerializer(),
  });
  await (
    proxy as unknown as {
      dispatchEvent: (packet: {
        pattern: string;
        data: unknown;
      }) => Promise<void>;
    }
  ).dispatchEvent({ pattern: 'posts.PostCreated.p-1', data });
  return sns.published[0]!;
};

const bodyOf = (input: PublishedInput): AwsMessageBody =>
  JSON.parse(input.Message) as AwsMessageBody;

describe('SnsRecordBuilder', () => {
  it('marks what it builds, so a domain event with an `options` field is not mistaken for one', () => {
    expect(SnsRecordBuilder.isRecord(new SnsRecordBuilder({}).build())).toBe(
      true,
    );
    expect(SnsRecordBuilder.isRecord({ data: {}, options: {} })).toBe(false);
  });

  it('publishes the event itself when nothing was attached', async () => {
    const input = await publish(new EventEnvelope({ postId: 'p-1' }, metadata));

    expect(bodyOf(input).data).toMatchObject({ postId: 'p-1' });
    expect(bodyOf(input).metadata).toMatchObject(metadata);
  });

  it('merges extra metadata into the envelope, where it survives the next hop', async () => {
    const input = await publish(
      new SnsRecordBuilder(new EventEnvelope({ postId: 'p-1' }, metadata))
        .setMetadata({ 'x-tenant': 'acme' })
        .build(),
    );

    expect(bodyOf(input).metadata).toMatchObject({
      ...metadata,
      'x-tenant': 'acme',
    });
    expect(bodyOf(input).data).toMatchObject({ postId: 'p-1' });
  });

  it('adds message attributes beside the routing ones a subscription filters on', async () => {
    const input = await publish(
      new SnsRecordBuilder(new EventEnvelope({ postId: 'p-1' }, metadata))
        .setMessageAttributes({
          priority: { DataType: 'String', StringValue: 'high' },
        })
        .build(),
    );

    expect(input.MessageAttributes).toMatchObject({
      priority: { DataType: 'String', StringValue: 'high' },
      messageType: {
        DataType: 'String',
        StringValue: 'posts.PostCreated#2.0.0',
      },
    });
  });
});
