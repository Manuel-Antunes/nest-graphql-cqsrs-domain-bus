import { randomUUID } from 'node:crypto';
import type { SNSClientConfig } from '@aws-sdk/client-sns';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { Logger } from '@nestjs/common';
import type {
  ProducerSerializer,
  ReadPacket,
  WritePacket,
} from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';

import {
  asMessageAttributes,
  orderingKeyIn,
  outgoingMessageOf,
} from './aws-message';
import type { SnsRecordOptions } from './sns-record.builder';
import { SnsRecordBuilder } from './sns-record.builder';

export interface SnsClientProxyOptions {
  /** The topic this destination publishes to. FIFO is inferred from the `.fifo` suffix. */
  readonly topicArn: string;
  /** A client to use instead of building one — a shared instance, or a double in a spec. */
  readonly client?: SNSClient;
  /** Passed to the client this proxy builds — the region, a LocalStack endpoint, credentials. */
  readonly clientConfig?: SNSClientConfig;
  /**
   * **How a packet becomes a message.** It may answer an {@link AwsOutgoingMessage} — a body, the
   * attributes a subscription filters on, the FIFO ids — and anything else is sent as the body.
   * `@nestposts/transport-eventbus`'s `AwsEventEnvelopeSerializer` is the one a service publishing
   * domain events wants. Left out, this behaves like any plain `ClientProxy` — Nest's own
   * `IdentitySerializer`, and the packet goes out as it came in, `{ pattern, data }`.
   */
  readonly serializer?: ProducerSerializer;
}

/**
 * **The `ClientProxy` for a topic: SNS is the exchange.**
 *
 * It is the AWS answer to the same question RabbitMQ's topic exchange answers — one publish, every
 * interested consumer — and the mapping is close enough to be worth stating:
 *
 * | RabbitMQ | AWS |
 * |---|---|
 * | topic exchange | SNS topic |
 * | queue bound to `posts.#` | SQS queue subscribed with a filter policy |
 * | routing key | the pattern, which the serializer decides where to put |
 * | headers | the message attributes the serializer answers with |
 *
 * ## FIFO, if the topic is one
 * `MessageGroupId` is, in order: the record's, the serializer's, or the pattern's last segment
 * ({@link orderingKeyIn}) — the aggregate, for a routing key shaped `namespace.Name.aggregate` — so a
 * FIFO topic orders one aggregate's messages against each other and lets different ones proceed in
 * parallel. `MessageDeduplicationId` is the record's, the serializer's, or a fresh one per send: a
 * serializer that knows an identity for what it sends should answer it, so that a retry of the same
 * publish is deduplicated by AWS.
 */
export class SnsClientProxy extends ClientProxy {
  private readonly logger = new Logger(SnsClientProxy.name);
  private readonly client: SNSClient;
  private readonly ownsClient: boolean;
  private readonly topicArn: string;
  private readonly fifo: boolean;

  constructor(options: SnsClientProxyOptions) {
    super();
    this.topicArn = options.topicArn;
    if (!this.topicArn) {
      throw new Error(
        'SnsClientProxy needs a topicArn: it is the destination, and a client without one would ' +
          'accept every publish and deliver none.',
      );
    }
    this.fifo = this.topicArn.endsWith('.fifo');
    this.ownsClient = !options.client;
    this.client = options.client ?? new SNSClient(options.clientConfig ?? {});
    this.initializeSerializer(options);
  }

  async connect(): Promise<void> {
    // SNS is a request over HTTPS: there is no connection to hold, and no failure to report early.
  }

  async close(): Promise<void> {
    if (this.ownsClient) {
      this.client.destroy();
    }
  }

  unwrap<T = SNSClient>(): T {
    return this.client as T;
  }

  protected publish(
    packet: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void {
    callback({
      err: new Error(
        `a topic carries events, not calls: nobody answers send() on ${String(packet.pattern)}. ` +
          'Use emit(), which is what the event bus does.',
      ),
    });
    return () => undefined;
  }

  protected async dispatchEvent<T = unknown>(packet: ReadPacket): Promise<T> {
    const record = SnsRecordBuilder.isRecord(packet.data)
      ? packet.data
      : undefined;
    const options: SnsRecordOptions = record?.options ?? {};
    const unwrapped = record ? { ...packet, data: record.data } : packet;
    const message = outgoingMessageOf(
      await this.serializer.serialize(unwrapped, { ...options }),
      unwrapped,
    );

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(message.body),
        MessageAttributes: {
          ...asMessageAttributes(message.attributes),
          ...(options.messageAttributes ?? {}),
        },
        ...(this.fifo
          ? {
              MessageGroupId:
                options.messageGroupId ??
                message.groupId ??
                orderingKeyIn(message.pattern),
              MessageDeduplicationId:
                options.messageDeduplicationId ??
                message.deduplicationId ??
                randomUUID(),
            }
          : {}),
      }),
    );

    this.logger.debug(`${message.pattern} → ${this.topicArn}`);
    return undefined as T;
  }
}
