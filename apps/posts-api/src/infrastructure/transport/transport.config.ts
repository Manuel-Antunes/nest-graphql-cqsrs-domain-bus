import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import {
  AwsEventEnvelopeSerializer,
  MemoryClient,
  MemoryEventEnvelopeSerializer,
  RmqEventEnvelopeDeserializer,
  RmqEventEnvelopeSerializer,
  SnsClientProxy,
  SqsEventEnvelopeDeserializer,
  SqsStrategy,
  TransportIdentity,
  localQueueUrl,
  localTopicArn,
} from '@nestposts/transport-eventbus';

export const POST_EVENTS_CLIENT = 'POST_EVENTS_CLIENT';

/** Who this service is on the wire — the mark every message it publishes carries. */
export const postsApiIdentity = (): TransportIdentity =>
  TransportIdentity.named(process.env.POSTS_APPLICATION_NAME ?? 'posts-api', {
    publishes: process.env.POSTS_PUBLISH_EVENTS !== 'false',
  });

export const EXCHANGE = process.env.POSTS_EXCHANGE ?? 'nestposts.events';

export const POST_COMPLETED_QUEUE =
  process.env.POSTS_COMPLETED_QUEUE ?? 'nestposts.posts-api.post-completed';

export const EVENTS_TOPIC_ARN = process.env.POSTS_TOPIC_ARN ?? localTopicArn('nestposts-events.fifo');

export const POST_COMPLETED_QUEUE_URL =
  process.env.POSTS_COMPLETED_QUEUE_URL ?? localQueueUrl('nestposts-posts-api-completed.fifo');

export type TransportMode = 'rabbitmq' | 'memory' | 'aws';

export const transportMode = (): TransportMode => {
  const declared = process.env.POSTS_TRANSPORT;
  return declared === 'memory' || declared === 'aws' ? declared : 'rabbitmq';
};

export const inboundDestination = (): string =>
  ({
    rabbitmq: POST_COMPLETED_QUEUE,
    aws: POST_COMPLETED_QUEUE_URL,
    memory: 'in process',
  })[transportMode()];

export const subscriptionsFromFeed = (): boolean => process.env.POSTS_SUBSCRIPTION_SOURCE === 'feed';

const urls = (): string[] => [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'];

export const postEventsClient = (): ClientProxy => {
  switch (transportMode()) {
    case 'aws':
      return new SnsClientProxy({
        topicArn: EVENTS_TOPIC_ARN,
        serializer: new AwsEventEnvelopeSerializer(),
      });
    case 'memory':
      return new MemoryClient({ servers: [], serializer: new MemoryEventEnvelopeSerializer() });
    default:
      return ClientProxyFactory.create({
        transport: Transport.RMQ,
        options: {
          urls: urls(),
          exchange: EXCHANGE,
          exchangeType: 'topic',
          wildcards: true,
          persistent: true,
          serializer: new RmqEventEnvelopeSerializer(),
        },
      });
  }
};

export const lambdaTransport = (): MicroserviceOptions => ({
  strategy: new SqsStrategy({ deserializer: new SqsEventEnvelopeDeserializer() }),
});

export const postCompletedTransport = (): MicroserviceOptions => {
  switch (transportMode()) {
    case 'aws':
      return {
        strategy: new SqsStrategy({
          queueUrl: POST_COMPLETED_QUEUE_URL,
          deserializer: new SqsEventEnvelopeDeserializer(),
        }),
      };
    case 'memory':
      return { strategy: new MemoryServer() };
    default:
      return {
        transport: Transport.RMQ,
        options: {
          urls: urls(),
          queue: POST_COMPLETED_QUEUE,
          queueOptions: { durable: true },
          exchange: EXCHANGE,
          exchangeType: 'topic',
          wildcards: true,
          noAck: false,
          deserializer: new RmqEventEnvelopeDeserializer(),
        },
      };
  }
};
