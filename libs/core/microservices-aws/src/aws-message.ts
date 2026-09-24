import type { ReadPacket } from '@nestjs/microservices';

/** The shape both SDKs call a `MessageAttributeValue`, for the subset this library sends. */
export interface AwsMessageAttribute {
  readonly DataType: string;
  readonly StringValue: string;
}

/** The shape an `SQSRecord` carries its attributes in — the same values, named the other way round. */
export interface SqsRecordAttribute {
  readonly stringValue?: string;
  readonly dataType?: string;
}

/**
 * **What a serializer hands {@link SnsClientProxy} or {@link SqsClientProxy}**: the body to send, the
 * attributes to select it by, and — for a FIFO destination — what orders and deduplicates it.
 *
 * A serializer that answers anything else (Nest's own `IdentitySerializer` included) is read as
 * "the whole answer is the body": the packet goes out as `{ pattern, data }`, which is exactly what
 * the default `IncomingRequestDeserializer` of {@link SqsStrategy} reads back.
 */
export interface AwsOutgoingMessage {
  readonly pattern: string;
  readonly body: unknown;
  readonly attributes?: Readonly<Record<string, string>>;
  /** FIFO only. Left out, the proxy falls back to a fresh id per send. */
  readonly deduplicationId?: string;
  /** FIFO only. Left out, the proxy uses {@link orderingKeyIn} of the pattern. */
  readonly groupId?: string;
}

const isAwsOutgoingMessage = (value: unknown): value is AwsOutgoingMessage =>
  typeof value === 'object' &&
  value !== null &&
  'pattern' in value &&
  'body' in value;

/** A serializer's answer, as the proxies send it — see {@link AwsOutgoingMessage}. */
export const outgoingMessageOf = (
  serialized: unknown,
  packet: ReadPacket,
): AwsOutgoingMessage =>
  isAwsOutgoingMessage(serialized)
    ? serialized
    : { pattern: String(packet.pattern), body: serialized ?? packet };

/**
 * Both SDKs reject an attribute whose `StringValue` is empty, with an error naming the parameter and
 * not the value — so a blank one is dropped here rather than at the API boundary.
 */
export const asMessageAttributes = (
  attributes: Readonly<Record<string, string>> | undefined,
): Record<string, AwsMessageAttribute> =>
  Object.fromEntries(
    Object.entries(attributes ?? {})
      .filter(
        ([, value]) =>
          value !== undefined && value !== null && String(value) !== '',
      )
      .map(([key, value]) => [
        key,
        { DataType: 'String', StringValue: String(value) },
      ]),
  );

/** The attributes of a delivered record, flattened back to a map of strings. */
export const fromRecordAttributes = (
  attributes: Record<string, SqsRecordAttribute> | undefined,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(attributes ?? {})
      .filter(([, attribute]) => typeof attribute?.stringValue === 'string')
      .map(([key, attribute]) => [key, attribute.stringValue as string]),
  );

/**
 * The last segment of a routing key — `posts.PostCreated.9f1d…` → `9f1d…`, the aggregate the event is
 * about. It is what a FIFO queue's `MessageGroupId` should be: FIFO orders **within a group**, so a
 * group per aggregate is per-aggregate ordering with parallelism between aggregates, while one group
 * for the topic would serialise the whole system.
 */
export const orderingKeyIn = (routingKey: string): string =>
  routingKey.split('.').pop() ?? routingKey;
