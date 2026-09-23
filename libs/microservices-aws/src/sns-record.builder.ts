import type { AwsMessageAttribute } from './aws-message';

/** The per-message knobs a topic has, and the payload has no reason to know about. */
export interface SnsRecordOptions {
  /** Extra attributes to send beside the ones the serializer already fills. */
  readonly messageAttributes?: Record<string, AwsMessageAttribute>;
  /**
   * Extra **metadata** for the serializer, which is handed the record's options as its second
   * argument and decides where on the wire they go. The envelope serializer merges them into the flat
   * map the far side reads back as the request's attributes; Nest's own serializer ignores them.
   */
  readonly metadata?: Record<string, string>;
  /** FIFO only. Left out, the serializer's, or the pattern's ordering key — see {@link SnsClientProxy}. */
  readonly messageGroupId?: string;
  /** FIFO only. Left out, the serializer's, or a fresh one per send. */
  readonly messageDeduplicationId?: string;
}

const SNS_RECORD = Symbol.for('nestposts.microservices-aws.sns-record');

/** A payload with SNS options attached — the shape {@link SnsRecordBuilder} builds. */
export interface SnsRecord<TData = unknown> {
  readonly data: TData;
  readonly options: SnsRecordOptions;
}

/**
 * **A topic's own options, attached to one publish** — the counterpart of {@link SqsRecordBuilder}
 * and of Nest's `RmqRecordBuilder`, and the same idea: the caller composes transport options without
 * the producer learning the transport.
 *
 * A domain event needs none of this. The forwarder emits an envelope and {@link SnsClientProxy}
 * derives the FIFO group from the event's aggregate and the deduplication id from its identifier.
 * What this is for is the message a service sends **on purpose** and wants something said about: a
 * filterable attribute a subscription's policy can select on, a header the far side should read back,
 * an ordering key that is not the aggregate's.
 *
 * ```ts
 * client.emit(pattern, new SnsRecordBuilder(payload).setMetadata({ 'x-tenant': 'acme' }).build());
 * ```
 */
export class SnsRecordBuilder<TData = unknown> {
  private options: SnsRecordOptions = {};

  constructor(private readonly data: TData) {}

  static isRecord<TData>(value: unknown): value is SnsRecord<TData> {
    return (
      typeof value === 'object' &&
      value !== null &&
      (value as Record<symbol, unknown>)[SNS_RECORD] === true
    );
  }

  setOptions(options: SnsRecordOptions): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  setMessageAttributes(attributes: Record<string, AwsMessageAttribute>): this {
    this.options = {
      ...this.options,
      messageAttributes: {
        ...(this.options.messageAttributes ?? {}),
        ...attributes,
      },
    };
    return this;
  }

  setMetadata(metadata: Record<string, string>): this {
    this.options = {
      ...this.options,
      metadata: { ...(this.options.metadata ?? {}), ...metadata },
    };
    return this;
  }

  setMessageGroupId(messageGroupId: string): this {
    return this.setOptions({ messageGroupId });
  }

  setMessageDeduplicationId(messageDeduplicationId: string): this {
    return this.setOptions({ messageDeduplicationId });
  }

  build(): SnsRecord<TData> {
    return {
      data: this.data,
      options: this.options,
      [SNS_RECORD]: true,
    } as SnsRecord<TData>;
  }
}
