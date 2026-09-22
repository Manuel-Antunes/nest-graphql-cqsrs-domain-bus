import { PublishCommand, SNSClient, type SNSClientConfig } from '@aws-sdk/client-sns';
import { Logger } from '@nestjs/common';
import {
  ClientProxy,
  type ProducerSerializer,
  type ReadPacket,
  type WritePacket,
} from '@nestjs/microservices';
import { TRANSPORT_IDENTIFIER } from '../outbound/event-envelope';
import { awsClientConfig } from './aws-client.config';
import { type AwsEnvelopeMessage, asMessageAttributes, orderingKeyIn } from './aws-message';

export interface SnsClientProxyOptions {
  /** The topic this destination publishes to. FIFO is inferred from the `.fifo` suffix. */
  readonly topicArn: string;
  /** A client to use instead of building one — a shared instance, or a double in a spec. */
  readonly client?: SNSClient;
  /** Passed to the client this proxy builds, over {@link awsClientConfig}'s answer. */
  readonly clientConfig?: SNSClientConfig;
  /**
   * **How an event becomes a message.** `AwsEventEnvelopeSerializer` is the one this library ships
   * and the one a service publishing domain events wants; it is not applied by default, because a
   * proxy that picks a wire format decides, quietly, what a service talking to something it did not
   * write is allowed to say. Left out, this behaves like any plain `ClientProxy` — Nest's own
   * `IdentitySerializer`, and the packet goes out as it came in.
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
 * | queue bound to `posts.#` | SQS queue subscribed with {@link SnsFilterPolicy.everyEventOf} |
 * | routing key | the `routingKey` message attribute, and `pattern` in the body |
 * | headers | the body's `metadata` (SQS allows ten attributes; the envelope needs more) |
 *
 * A destination is still a `@Publisher` holding this client, and the routing table still picks it by
 * namespace: nothing above this class knows which of the two it is talking to.
 *
 * ## FIFO, if the topic is one
 * `MessageGroupId` is the event's **aggregate** ({@link orderingKeyIn}), so a FIFO topic orders one
 * post's events against each other and lets different posts proceed in parallel. One group for the
 * whole topic would be ordering by serialising the system. `MessageDeduplicationId` is the
 * envelope's identifier, which is generated once per event instance and remembered on it — so a
 * retry of the same publish is deduplicated by AWS before the inbox on the other side has to.
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
    this.client = options.client ?? new SNSClient({ ...awsClientConfig(), ...options.clientConfig });
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

  protected publish(packet: ReadPacket, callback: (packet: WritePacket) => void): () => void {
    callback({
      err: new Error(
        `a topic carries events, not calls: nobody answers send() on ${String(packet.pattern)}. ` +
          'Use emit(), which is what the event bus does.',
      ),
    });
    return () => undefined;
  }

  protected async dispatchEvent<T = unknown>(packet: ReadPacket): Promise<T> {
    const message = (await this.serializer.serialize(packet)) as AwsEnvelopeMessage;

    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(message.body),
        MessageAttributes: asMessageAttributes(message.attributes),
        ...(this.fifo
          ? {
              MessageGroupId: orderingKeyIn(message.pattern),
              MessageDeduplicationId: message.body.metadata[TRANSPORT_IDENTIFIER],
            }
          : {}),
      }),
    );

    this.logger.debug(`${message.pattern} → ${this.topicArn}`);
    return undefined as T;
  }
}
