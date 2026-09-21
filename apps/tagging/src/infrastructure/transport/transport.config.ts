import { Injectable } from '@nestjs/common';
import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import {
  type ClientProxy,
  ClientProxyFactory,
  type MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import {
  MemoryClient,
  MemoryEventEnvelopeSerializer,
  RmqEventEnvelopeDeserializer,
  RmqEventEnvelopeSerializer,
  TransportIdentity,
} from '@nestposts/transport-eventbus';

export const POST_EVENTS_CLIENT = 'POST_EVENTS_CLIENT';

export const EXCHANGE = process.env.TAGGING_EXCHANGE ?? 'nestposts.events';

export const INBOUND_QUEUE = process.env.TAGGING_QUEUE ?? 'nestposts.tagging.post-events';

export type TransportMode = 'rabbitmq' | 'memory';

export const transportMode = (): TransportMode =>
  process.env.TAGGING_TRANSPORT === 'memory' ? 'memory' : 'rabbitmq';

const urls = (): string[] => [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'];

@Injectable()
export class TaggingIdentity extends TransportIdentity {
  readonly applicationName = process.env.TAGGING_APPLICATION_NAME ?? 'tagging';

  override readonly publishes = process.env.TAGGING_PUBLISH_EVENTS !== 'false';
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

/**
 * One queue for this service, bound to the routing keys its controllers declare.
 *
 * A queue per SERVICE is not optional on RabbitMQ: a copy is made per bound queue, not per consumer,
 * so two applications sharing a queue would compete for the messages instead of each receiving one —
 * and whichever discards it acknowledges it, killing it for the other.
 */
export const inboundTransport = (): MicroserviceOptions =>
  transportMode() === 'rabbitmq'
    ? {
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
      }
    : { strategy: new MemoryServer() };
