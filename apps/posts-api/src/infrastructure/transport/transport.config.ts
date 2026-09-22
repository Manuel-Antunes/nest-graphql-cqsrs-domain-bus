import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import type { HttpServer } from '@nestjs/common';
import type { Inngest } from 'inngest';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import {
  AwsEventEnvelopeSerializer,
  InngestClientProxy,
  InngestEventEnvelopeDeserializer,
  InngestEventEnvelopeSerializer,
  InngestStrategy,
  MemoryClient,
  inngestApp,
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

export type TransportMode = 'inngest' | 'rabbitmq' | 'memory' | 'aws';

/**
 * **Inngest is what a developer gets by default.** It needs no broker to be running and no
 * credentials, and the dev server it talks to is a container in `docker-compose.yml`. `rabbitmq` is
 * still here, and still what the deployed shape's non-AWS half would use — it is asked for by name.
 */
export const transportMode = (): TransportMode => {
  const declared = process.env.POSTS_TRANSPORT;
  return declared === 'memory' || declared === 'aws' || declared === 'rabbitmq'
    ? declared
    : 'inngest';
};

let client: Inngest.Any | undefined;

/** One client for both halves: the proxy sends on it and the strategy creates its functions on it. */
export const inngest = (): Inngest.Any => (client ??= inngestApp('posts-api'));

export const inboundDestination = (): string =>
  ({
    rabbitmq: POST_COMPLETED_QUEUE,
    aws: POST_COMPLETED_QUEUE_URL,
    inngest: 'inngest functions',
    memory: 'in process',
  })[transportMode()];

export const subscriptionsFromFeed = (): boolean => process.env.POSTS_SUBSCRIPTION_SOURCE === 'feed';

const urls = (): string[] => [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'];

export const postEventsClient = (): ClientProxy => {
  switch (transportMode()) {
    case 'inngest':
      return new InngestClientProxy({
        inngest: inngest(),
        serializer: new InngestEventEnvelopeSerializer(),
      });
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

export const postCompletedTransport = (httpAdapter?: HttpServer): MicroserviceOptions => {
  switch (transportMode()) {
    case 'inngest':
      return {
        strategy: new InngestStrategy({
          inngest: inngest(),
          deserializer: new InngestEventEnvelopeDeserializer(),
          httpAdapter,
        }),
      };
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
