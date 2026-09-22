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
export const taggingIdentity = (): TransportIdentity =>
  TransportIdentity.named(process.env.TAGGING_APPLICATION_NAME ?? 'tagging', {
    publishes: process.env.TAGGING_PUBLISH_EVENTS !== 'false',
  });

export const EXCHANGE = process.env.TAGGING_EXCHANGE ?? 'nestposts.events';

export const INBOUND_QUEUE = process.env.TAGGING_QUEUE ?? 'nestposts.tagging.post-events';

export const EVENTS_TOPIC_ARN = process.env.TAGGING_TOPIC_ARN ?? localTopicArn('nestposts-events.fifo');

const LOCAL_QUEUES = ['nestposts-tagging-post-events.fifo'];

export const INBOUND_QUEUE_URLS = (
  process.env.TAGGING_QUEUE_URL ?? LOCAL_QUEUES.map(localQueueUrl).join(',')
)
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

export type TransportMode = 'inngest' | 'rabbitmq' | 'memory' | 'aws';

/**
 * **Inngest is what a developer gets by default.** It needs no broker to be running and no
 * credentials, and the dev server it talks to is a container in `docker-compose.yml`. `rabbitmq` is
 * still here, and still what the deployed shape's non-AWS half would use — it is asked for by name.
 */
export const transportMode = (): TransportMode => {
  const declared = process.env.TAGGING_TRANSPORT;
  return declared === 'memory' || declared === 'aws' || declared === 'rabbitmq'
    ? declared
    : 'inngest';
};

let client: Inngest.Any | undefined;

/** One client for both halves: the proxy sends on it and the strategy creates its functions on it. */
export const inngest = (): Inngest.Any => (client ??= inngestApp('tagging'));

export const inboundDestination = (): string =>
  ({
    rabbitmq: INBOUND_QUEUE,
    aws: INBOUND_QUEUE_URLS.join(', '),
    inngest: 'inngest functions',
    memory: 'in process',
  })[transportMode()];

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

/**
 * One queue for this service, bound to the routing keys its controllers declare.
 *
 * A queue per SERVICE is not optional on RabbitMQ: a copy is made per bound queue, not per consumer,
 * so two applications sharing a queue would compete for the messages instead of each receiving one —
 * and whichever discards it acknowledges it, killing it for the other.
 */
export const inboundTransport = (httpAdapter?: HttpServer): MicroserviceOptions => {
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
          queueUrl: INBOUND_QUEUE_URLS,
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
          queue: INBOUND_QUEUE,
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
