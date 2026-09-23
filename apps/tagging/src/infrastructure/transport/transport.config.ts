import type { MicroserviceOptions } from '@nestjs/microservices';
import {
  localQueueUrl,
  localTopicArn,
  SqsStrategy,
} from '@nestposts/microservices-aws';
import { inngestApp } from '@nestposts/microservices-inngest';
import { RmqRetryTopology } from '@nestposts/retry-policy/adapters/rmq-retry.topology';
import {
  SqsEventEnvelopeDeserializer,
  TransportIdentity,
} from '@nestposts/transport-eventbus';
import type { Inngest } from 'inngest';

export const POST_EVENTS_CLIENT = 'POST_EVENTS_CLIENT';

/** Who this service is on the wire — the mark every message it publishes carries. */
export const taggingIdentity = (): TransportIdentity =>
  TransportIdentity.named(process.env.TAGGING_APPLICATION_NAME ?? 'tagging', {
    publishes: process.env.TAGGING_PUBLISH_EVENTS !== 'false',
  });

export const EXCHANGE = process.env.TAGGING_EXCHANGE ?? 'nestposts.events';

export const INBOUND_QUEUE =
  process.env.TAGGING_QUEUE ?? 'nestposts.tagging.post-events';

export const POST_EVENTS_MAX_RETRIES = 3;

export const retryDelayMs = (): number => {
  const declared = Number(process.env.TAGGING_RETRY_DELAY_MS);
  return Number.isFinite(declared) && declared >= 0 ? declared : 5_000;
};

export const inboundRetryTopology = (): RmqRetryTopology =>
  new RmqRetryTopology({ queue: INBOUND_QUEUE, retryDelayMs: retryDelayMs() });

export const EVENTS_TOPIC_ARN =
  process.env.TAGGING_TOPIC_ARN ?? localTopicArn('nestposts-events.fifo');

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

export const urls = (): string[] => [
  process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
];

export const lambdaTransport = (): MicroserviceOptions => ({
  strategy: new SqsStrategy({
    deserializer: new SqsEventEnvelopeDeserializer(),
  }),
});
