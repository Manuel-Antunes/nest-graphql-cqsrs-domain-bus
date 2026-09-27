import type { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { RmqRecord } from '@nestjs/microservices';
import type { OutboxEnvelope, OutboxMessage } from '@nestjs/outbox';
import { SnsClientProxy } from '@nestposts/microservices-aws';
import { InngestClientProxy } from '@nestposts/microservices-inngest';

import {
  AWS_MESSAGE_TYPE_ATTRIBUTE,
  AWS_NAMESPACE_ATTRIBUTE,
  AWS_ORIGIN_ATTRIBUTE,
  AWS_QUALIFIED_NAME_ATTRIBUTE,
  AWS_ROUTING_KEY_ATTRIBUTE,
} from '../aws/aws-message';
import { CORRELATION_ID } from '../request-context';
import {
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
} from './message-headers';
import { CORRELATION_SESSION, OutboxPackets } from './outbox-packets';

const TOPIC = 'posts.PostCreated.p-1';

const envelope: OutboxEnvelope = {
  id: 'evt-1',
  topic: TOPIC,
  key: 'posts/p-1',
  createdAt: 1_790_000_000_000,
  headers: {
    [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
    [TRANSPORT_ORIGIN]: 'tagging',
    [TRANSPORT_TAGS]: 'postId=p-1',
    [CORRELATION_ID]: 'corr-1',
    'x-tenant': 'acme',
  },
  payload: {
    postId: 'p-1',
    occurredAt: { '@date': '2026-09-08T12:00:00.000Z' },
  },
};

const message = {
  ...envelope,
  availableAt: envelope.createdAt,
  attempts: 0,
  lastError: null,
} as OutboxMessage;

describe('an outbox message on each transport', () => {
  describe('RabbitMQ', () => {
    const packet = OutboxPackets.rabbitmq(message, envelope);

    it('goes out under its routing key, which a topic exchange binds on', () => {
      expect(packet.pattern).toBe(TOPIC);
    });

    it('is a record whose body is the envelope and whose AMQP headers are its headers', () => {
      expect(packet.data).toBeInstanceOf(RmqRecord);
      const record = packet.data as RmqRecord<OutboxEnvelope>;
      expect(record.data).toBe(envelope);
      expect(record.options).toMatchObject({
        headers: envelope.headers,
        messageId: 'evt-1',
        persistent: true,
      });
    });
  });

  describe('SNS', () => {
    const published: PublishCommand['input'][] = [];
    const first = (): PublishCommand['input'] => {
      const [input] = published;
      if (!input) {
        throw new Error('nothing was published');
      }
      return input;
    };
    const client = {
      send: async (command: PublishCommand) => {
        published.push(command.input);
        return {};
      },
    } as unknown as SNSClient;

    beforeAll(async () => {
      const proxy = new SnsClientProxy({
        topicArn: 'arn:aws:sns:us-east-1:000000000000:events.fifo',
        client,
      });
      const { pattern, data } = OutboxPackets.aws(message, envelope);
      await (
        proxy as unknown as {
          dispatchEvent: (packet: object) => Promise<void>;
        }
      ).dispatchEvent({ pattern, data });
    });

    it('carries the envelope in the body, under the pattern a queue reads it back by', () => {
      expect(JSON.parse(first().Message ?? '')).toEqual({
        pattern: TOPIC,
        data: envelope,
      });
    });

    it('lifts the routing facts into message attributes, because a filter policy reads nothing else', () => {
      const attributes = first().MessageAttributes ?? {};
      expect(
        Object.fromEntries(
          Object.entries(attributes).map(([key, value]) => [
            key,
            value.StringValue,
          ]),
        ),
      ).toEqual({
        [AWS_ROUTING_KEY_ATTRIBUTE]: TOPIC,
        [AWS_MESSAGE_TYPE_ATTRIBUTE]: 'posts.PostCreated#2.0.0',
        [AWS_QUALIFIED_NAME_ATTRIBUTE]: 'posts.PostCreated',
        [AWS_NAMESPACE_ATTRIBUTE]: 'posts',
        [AWS_ORIGIN_ATTRIBUTE]: 'tagging',
      });
    });

    it('orders by the aggregate and deduplicates by the message id on a FIFO topic', () => {
      expect(first()).toMatchObject({
        MessageGroupId: 'p-1',
        MessageDeduplicationId: 'evt-1',
      });
    });
  });

  describe('Inngest', () => {
    const sent: Record<string, unknown>[] = [];

    beforeAll(async () => {
      const proxy = new InngestClientProxy({
        inngest: {
          send: async (payload: Record<string, unknown>) => {
            sent.push(payload);
          },
        } as never,
      });
      const { pattern, data } = OutboxPackets.inngest(message, envelope);
      await (
        proxy as unknown as {
          dispatchEvent: (packet: object) => Promise<void>;
        }
      ).dispatchEvent({ pattern, data });
    });

    it('names the event by its QUALIFIED name, because a trigger has no wildcards', () => {
      expect(sent[0]).toMatchObject({ name: 'posts.PostCreated' });
    });

    it('carries the envelope as the event data', () => {
      expect(sent[0]).toMatchObject({ data: envelope });
    });

    it('turns the message id into the event id, so the relay publishing twice is one run', () => {
      expect(sent[0]).toMatchObject({ id: 'posts.PostCreated:evt-1' });
    });

    it('groups the whole request under one session, from the correlation id', () => {
      expect(sent[0]).toMatchObject({
        meta: { sessions: { [CORRELATION_SESSION]: 'corr-1' } },
      });
    });
  });

  it('goes in process as the envelope itself', () => {
    expect(OutboxPackets.memory(message, envelope)).toEqual({
      pattern: TOPIC,
      data: envelope,
    });
  });

  it('is picked by the kind of transport a client is', () => {
    expect(OutboxPackets.for('aws')).toBe(OutboxPackets.aws);
    expect(OutboxPackets.for('memory')).toBe(OutboxPackets.memory);
  });
});
