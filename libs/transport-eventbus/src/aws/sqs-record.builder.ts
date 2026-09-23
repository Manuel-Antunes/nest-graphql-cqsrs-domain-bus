import type { AwsMessageAttribute } from './aws-message';

/** The per-message knobs SQS has and the envelope has no reason to know about. */
export interface SqsRecordOptions {
  /**
   * Hold the message back before anybody may receive it, 0–900s. It is SQS's own delay and not a
   * scheduler: past 900 the send is refused rather than truncated, because a sentinel that arrives
   * fifteen minutes after it should is worse than one that never left.
   */
  readonly delaySeconds?: number;
  /** Extra attributes to send beside the ones the envelope's routing facts already fill. */
  readonly messageAttributes?: Record<string, AwsMessageAttribute>;
  /** FIFO only. Left out, the client uses the event's own ordering key — see {@link SqsClientProxy}. */
  readonly messageGroupId?: string;
  /** FIFO only. Left out, the client uses the envelope's identifier, which is unique per event. */
  readonly messageDeduplicationId?: string;
}

const SQS_RECORD = Symbol.for('nestposts.transport-eventbus.sqs-record');

/** A payload with SQS options attached — the shape {@link SqsRecordBuilder} builds. */
export interface SqsRecord<TData = unknown> {
  readonly data: TData;
  readonly options: SqsRecordOptions;
}

/**
 * Whether a payload carries SQS options. A marker symbol and not a duck-typed `'options' in value`,
 * because a domain event with a property called `options` is not a transport instruction.
 */
export const isSqsRecord = <TData>(value: unknown): value is SqsRecord<TData> =>
  typeof value === 'object' &&
  value !== null &&
  (value as Record<symbol, unknown>)[SQS_RECORD] === true;

/**
 * **SQS's own options, attached to one message** — the counterpart of Nest's `RmqRecordBuilder`, and
 * the same idea: the caller composes transport options without the producer learning the transport.
 *
 * A domain event needs none of this. The forwarder emits an envelope and {@link SqsClientProxy}
 * derives the FIFO group from the event's aggregate and the deduplication id from its identifier,
 * which is what per-aggregate ordering on a FIFO queue actually wants. What this is for is the other
 * kind of message a service sends on purpose: a delayed sentinel, a retry nudge, anything whose
 * timing is the point.
 *
 * ```ts
 * client.emit(pattern, new SqsRecordBuilder(payload).setDelaySeconds(40).build());
 * ```
 */
export class SqsRecordBuilder<TData = unknown> {
  private options: SqsRecordOptions = {};

  constructor(private readonly data: TData) {}

  setOptions(options: SqsRecordOptions): this {
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

  setDelaySeconds(seconds: number): this {
    return this.setOptions({ delaySeconds: seconds });
  }

  setMessageGroupId(messageGroupId: string): this {
    return this.setOptions({ messageGroupId });
  }

  setMessageDeduplicationId(messageDeduplicationId: string): this {
    return this.setOptions({ messageDeduplicationId });
  }

  build(): SqsRecord<TData> {
    return {
      data: this.data,
      options: this.options,
      [SQS_RECORD]: true,
    } as SqsRecord<TData>;
  }
}
