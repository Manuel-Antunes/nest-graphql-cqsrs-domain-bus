import {
  namespaceIn,
  qualifiedNameIn,
} from '@nestposts/platform/domain/shared/event-type';

import type { EnvelopeMetadata } from '../outbound/event-envelope';
import {
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
} from '../outbound/event-envelope';

/**
 * **The routing facts, lifted out of the envelope so a subscription can select on them.**
 *
 * SNS filters a subscription by **message attributes** and nothing else: it does not look inside the
 * body, and a filter policy is the only thing standing between a queue and every event of the system.
 * So the five facts a consumer could want to select by travel twice — in the metadata, where the rest
 * of the envelope is, and here, where AWS can read them.
 *
 * ## Why only five, and why the metadata is NOT one attribute per key
 * SNS allows **ten** message attributes per message. The envelope routinely carries more than that on
 * its own — five transport keys, correlation, causation, the tenant, the application's own request
 * attributes, the trace context — so a message that put each of them in an attribute would start
 * failing the day somebody added the eleventh, on a service nobody was looking at. The whole metadata
 * map therefore travels in the body ({@link AwsMessageBody}) and only the selection travels here.
 *
 * {@link SnsFilterPolicy} is the other half: it builds the policy a subscription is created with, from
 * the same namespace and the same event class `@EventPattern` binds to.
 */
export const AWS_NAMESPACE_ATTRIBUTE = 'namespace';

/** `posts.PostCreated` — what a subscription interested in one event type filters on. */
export const AWS_QUALIFIED_NAME_ATTRIBUTE = 'qualifiedName';

/** `posts.PostCreated#2.0.0` — the version included, for a subscription that pins one. */
export const AWS_MESSAGE_TYPE_ATTRIBUTE = 'messageType';

/** `posts.PostCreated.9f1d…` — the whole key, which is what the consumer matches its patterns against. */
export const AWS_ROUTING_KEY_ATTRIBUTE = 'routingKey';

/** The publishing service, so a subscription can refuse a service its own echo before it is billed for it. */
export const AWS_ORIGIN_ATTRIBUTE = 'origin';

/**
 * **What is actually published: the event, the metadata, and the key it went out under.**
 *
 * The same object is the SNS `Message` and the SQS `MessageBody`, because with raw message delivery on
 * a subscription they ARE the same string — the queue receives the topic's message unaltered. One wire
 * format therefore serves a fan-out through a topic and a point-to-point send to a queue, and a
 * consumer cannot tell (or need to tell) which one it was.
 *
 * `data` is the event as the application wrote it, exactly as on RabbitMQ. `metadata` is beside it
 * rather than in headers because SQS's ten-attribute cap makes headers a place the envelope does not
 * fit — see {@link AWS_NAMESPACE_ATTRIBUTE}.
 */
export interface AwsMessageBody {
  readonly pattern: string;
  readonly data: Record<string, unknown>;
  readonly metadata: EnvelopeMetadata;
}

/** What {@link AwsEventEnvelopeSerializer} hands a client: the body to send, and what to select it by. */
export interface AwsEnvelopeMessage {
  readonly pattern: string;
  readonly body: AwsMessageBody;
  readonly attributes: EnvelopeMetadata;
}

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

/** The five facts of {@link AWS_NAMESPACE_ATTRIBUTE}, read off the envelope the forwarder built. */
export const routingAttributesOf = (
  routingKey: string,
  metadata: EnvelopeMetadata,
): EnvelopeMetadata => {
  const messageType = metadata[TRANSPORT_MESSAGE_TYPE] ?? '';
  const attributes: Record<string, string> = {
    [AWS_ROUTING_KEY_ATTRIBUTE]: routingKey,
    [AWS_MESSAGE_TYPE_ATTRIBUTE]: messageType,
    [AWS_QUALIFIED_NAME_ATTRIBUTE]: qualifiedNameIn(messageType),
    [AWS_NAMESPACE_ATTRIBUTE]: namespaceIn(messageType),
  };
  const origin = metadata[TRANSPORT_ORIGIN];
  if (origin) {
    attributes[AWS_ORIGIN_ATTRIBUTE] = origin;
  }
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== ''),
  );
};

/**
 * **A body with a record's extra metadata merged in.** Metadata is what survives every hop — the far
 * side reads it back as the request's attributes — where a message attribute belongs to one message
 * on one transport, so a record that says something the chain should carry says it here.
 */
export const withExtraMetadata = (
  body: AwsMessageBody,
  extra: Record<string, string> | undefined,
): AwsMessageBody =>
  extra ? { ...body, metadata: { ...body.metadata, ...extra } } : body;

/**
 * Both SDKs reject an attribute whose `StringValue` is empty, with an error naming the parameter and
 * not the value — so a blank one is dropped here rather than at the API boundary.
 */
export const asMessageAttributes = (
  attributes: EnvelopeMetadata,
): Record<string, AwsMessageAttribute> =>
  Object.fromEntries(
    Object.entries(attributes)
      .filter(
        ([, value]) =>
          value !== undefined && value !== null && String(value) !== '',
      )
      .map(([key, value]) => [
        key,
        { DataType: 'String', StringValue: String(value) },
      ]),
  );

/** The attributes of a delivered record, flattened back to the map the envelope is made of. */
export const fromRecordAttributes = (
  attributes: Record<string, SqsRecordAttribute> | undefined,
): EnvelopeMetadata =>
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
