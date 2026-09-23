import type { SQSClientConfig } from '@aws-sdk/client-sqs';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { Logger } from '@nestjs/common';
import type {
  ProducerSerializer,
  ReadPacket,
  WritePacket,
} from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';

import { TRANSPORT_IDENTIFIER } from '../outbound/event-envelope';
import { awsClientConfig, queueNameOf } from './aws-client.config';
import type { AwsEnvelopeMessage } from './aws-message';
import { asMessageAttributes, orderingKeyIn } from './aws-message';
import type { SqsRecordOptions } from './sqs-record.builder';
import { isSqsRecord } from './sqs-record.builder';

/** SQS's own limit on how long a single message may be held back. */
const MAX_DELAY_SECONDS = 900;

export interface SqsClientProxyOptions {
  /** The queue this destination sends to. FIFO is inferred from the `.fifo` suffix. */
  readonly queueUrl: string;
  readonly client?: SQSClient;
  readonly clientConfig?: SQSClientConfig;
  /** How an event becomes a message — optional, for the reason {@link SnsClientProxyOptions} gives. */
  readonly serializer?: ProducerSerializer;
}

/**
 * **The `ClientProxy` for one queue: a message addressed to a service, not announced to a system.**
 *
 * {@link SnsClientProxy} is the one a domain event normally leaves through — a fact is published, and
 * who cares about it is their business. This one names a consumer, which makes it the right thing for
 * the messages that are not facts: a command sent to a worker, a delayed sentinel, a retry nudge, a
 * queue somebody else owns and asked to be written to directly.
 *
 * It writes the **same body** {@link SnsClientProxy} does, so a queue fed both ways — subscribed to
 * the topic and written to directly — needs one consumer and one deserializer.
 */
export class SqsClientProxy extends ClientProxy {
  private readonly logger = new Logger(SqsClientProxy.name);
  private readonly client: SQSClient;
  private readonly ownsClient: boolean;
  private readonly queueUrl: string;
  private readonly fifo: boolean;

  constructor(options: SqsClientProxyOptions) {
    super();
    this.queueUrl = options.queueUrl;
    if (!this.queueUrl) {
      throw new Error(
        'SqsClientProxy needs a queueUrl: it is the destination, and a client without one would ' +
          'accept every send and deliver none.',
      );
    }
    this.fifo = this.queueUrl.endsWith('.fifo');
    this.ownsClient = !options.client;
    this.client =
      options.client ??
      new SQSClient({ ...awsClientConfig(), ...options.clientConfig });
    this.initializeSerializer(options);
  }

  async connect(): Promise<void> {
    // SQS is a request over HTTPS: there is no connection to hold.
  }

  async close(): Promise<void> {
    if (this.ownsClient) {
      this.client.destroy();
    }
  }

  unwrap<T = SQSClient>(): T {
    return this.client as T;
  }

  protected publish(
    packet: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void {
    callback({
      err: new Error(
        `a queue carries messages, not calls: nobody answers send() on ${String(packet.pattern)}. ` +
          'Use emit().',
      ),
    });
    return () => undefined;
  }

  protected async dispatchEvent<T = unknown>(packet: ReadPacket): Promise<T> {
    const record = isSqsRecord(packet.data) ? packet.data : undefined;
    const options = record?.options ?? {};
    const message = (await this.serializer.serialize(
      record ? { ...packet, data: record.data } : packet,
    )) as AwsEnvelopeMessage;

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message.body),
        MessageAttributes: asMessageAttributes({
          ...message.attributes,
          ...attributeStrings(options.messageAttributes),
        }),
        DelaySeconds: this.delayOf(options),
        ...(this.fifo
          ? {
              MessageGroupId:
                options.messageGroupId ?? orderingKeyIn(message.pattern),
              MessageDeduplicationId:
                options.messageDeduplicationId ??
                message.body.metadata[TRANSPORT_IDENTIFIER],
            }
          : {}),
      }),
    );

    this.logger.debug(`${message.pattern} → ${queueNameOf(this.queueUrl)}`);
    return undefined as T;
  }

  /**
   * A delay past SQS's fifteen minutes is **refused** rather than silently clamped: a sentinel that
   * arrives fourteen minutes and fifty-nine seconds before it should is a bug that only shows up as
   * work happening too early, with nothing in any log. A FIFO queue takes no per-message delay at
   * all — the queue's own `DelaySeconds` is the only one it has — so asking for one there is a
   * warning and an immediate send, which is what the queue would have done anyway.
   */
  private delayOf(options: SqsRecordOptions): number | undefined {
    const delaySeconds = options.delaySeconds;
    if (!delaySeconds) {
      return undefined;
    }
    if (delaySeconds > MAX_DELAY_SECONDS) {
      throw new Error(
        `DelaySeconds=${delaySeconds} is past SQS's limit of ${MAX_DELAY_SECONDS}s. Hold the ` +
          'message somewhere that can wait that long, or schedule the send itself.',
      );
    }
    if (this.fifo) {
      this.logger.warn(
        `${queueNameOf(this.queueUrl)} is a FIFO queue and takes no per-message DelaySeconds; ` +
          `the ${delaySeconds}s asked for are ignored and the message is sent now.`,
      );
      return undefined;
    }
    return delaySeconds;
  }
}

const attributeStrings = (
  attributes: SqsRecordOptions['messageAttributes'],
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(attributes ?? {}).map(([key, attribute]) => [
      key,
      attribute.StringValue,
    ]),
  );
