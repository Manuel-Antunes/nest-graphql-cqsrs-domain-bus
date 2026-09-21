import { Injectable } from '@nestjs/common';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import {
  MemoryClient,
  MemoryEventEnvelopeSerializer,
  RmqEventEnvelopeDeserializer,
  RmqEventEnvelopeSerializer,
  TransportIdentity,
} from '@nestposts/transport-eventbus';

export const POST_EVENTS_CLIENT = 'POST_EVENTS_CLIENT';

export const EXCHANGE = process.env.POSTS_EXCHANGE ?? 'nestposts.events';

export const POST_COMPLETED_QUEUE = process.env.POSTS_COMPLETED_QUEUE ?? 'nestposts.posts-api.post-completed';

export type TransportMode = 'rabbitmq' | 'memory';

export const transportMode = (): TransportMode =>
  process.env.POSTS_TRANSPORT === 'memory' ? 'memory' : 'rabbitmq';

export const taggingInProcess = (): boolean => process.env.POSTS_TAGGING_IN_PROCESS === 'true';

const urls = (): string[] => [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'];

@Injectable()
export class PostsApiIdentity extends TransportIdentity {
  readonly applicationName = process.env.POSTS_APPLICATION_NAME ?? 'posts-api';

  override readonly publishes = process.env.POSTS_PUBLISH_EVENTS !== 'false';
}

export const postEventsClient = (): ClientProxy =>
  transportMode() === 'rabbitmq'
    ? ClientProxyFactory.create({
        transport: Transport.RMQ,
        options: {
          urls: urls(),
          exchange: EXCHANGE,
          exchangeType: 'topic',
          wildcards: true,
          persistent: true,
          serializer: new RmqEventEnvelopeSerializer(),
        },
      })
    : new MemoryClient({ servers: [], serializer: new MemoryEventEnvelopeSerializer() });

export const postCompletedTransport = (): MicroserviceOptions =>
  transportMode() === 'rabbitmq'
    ? {
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
      }
    : { strategy: new MemoryServer() };
