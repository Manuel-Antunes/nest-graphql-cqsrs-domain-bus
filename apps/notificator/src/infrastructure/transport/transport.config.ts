import type { MicroserviceOptions } from '@nestjs/microservices';
import { localQueueUrl, SqsStrategy } from '@nestposts/microservices-aws';
import { inngestApp } from '@nestposts/microservices-inngest';
import { RmqRetryTopology } from '@nestposts/retry-policy/adapters/rmq-retry.topology';
import {
  SqsEventEnvelopeDeserializer,
  TransportIdentity,
} from '@nestposts/transport-eventbus';
import type { Inngest } from 'inngest';

export const notificatorIdentity = (): TransportIdentity =>
  TransportIdentity.named(
    process.env.NOTIFICATOR_APPLICATION_NAME ?? 'notificator',
    { publishes: false },
  );

export const EXCHANGE = process.env.NOTIFICATOR_EXCHANGE ?? 'nestposts.events';

export const INBOUND_QUEUE =
  process.env.NOTIFICATOR_QUEUE ??
  'nestposts.notificator.notification-requests';

export const NOTIFICATION_MAX_RETRIES = 3;

export const retryDelayMs = (): number => {
  const declared = Number(process.env.NOTIFICATOR_RETRY_DELAY_MS);
  return Number.isFinite(declared) && declared >= 0 ? declared : 5_000;
};

export const inboundRetryTopology = (): RmqRetryTopology =>
  new RmqRetryTopology({ queue: INBOUND_QUEUE, retryDelayMs: retryDelayMs() });

const LOCAL_QUEUES = ['nestposts-notificator-notifications.fifo'];

export const INBOUND_QUEUE_URLS = (
  process.env.NOTIFICATOR_QUEUE_URL ?? LOCAL_QUEUES.map(localQueueUrl).join(',')
)
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

export type TransportMode = 'inngest' | 'rabbitmq' | 'memory' | 'aws';

export const transportMode = (): TransportMode => {
  const declared = process.env.NOTIFICATOR_TRANSPORT;
  return declared === 'memory' || declared === 'aws' || declared === 'rabbitmq'
    ? declared
    : 'inngest';
};

let client: Inngest.Any | undefined;

export const inngest = (): Inngest.Any =>
  (client ??= inngestApp('notificator'));

export const inboundDestination = (): string =>
  ({
    rabbitmq: INBOUND_QUEUE,
    aws: INBOUND_QUEUE_URLS.join(', '),
    inngest: 'inngest functions',
    memory: 'in process',
  })[transportMode()];

export const urls = (): string[] => [
  process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
];

export const lambdaTransport = (): MicroserviceOptions => ({
  strategy: new SqsStrategy({
    deserializer: new SqsEventEnvelopeDeserializer(),
  }),
});
