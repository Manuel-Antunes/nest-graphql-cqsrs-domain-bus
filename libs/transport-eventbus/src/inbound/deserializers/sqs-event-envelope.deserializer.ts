import { AWS_ROUTING_KEY_ATTRIBUTE, type AwsMessageBody } from '../../aws/aws-message';
import { type EnvelopeMetadata, EventEnvelope } from '../../outbound/event-envelope';
import { EventEnvelopeDeserializer, type IncomingEnvelope } from './event-envelope.deserializer';

/** What SNS delivers when a subscription does **not** have raw message delivery turned on. */
interface SnsNotification {
  readonly Type: string;
  readonly Message: string;
  readonly MessageAttributes?: Record<string, { Type?: string; Value?: string }>;
}

/**
 * **The AWS half of the wire: whatever arrived on the queue becomes the envelope again.**
 *
 * The record's body is what {@link AwsEventEnvelopeSerializer} wrote — the event, the metadata and
 * the routing key — so both halves come out of one JSON object rather than out of a body and a set of
 * headers. That is the shape SQS's ten-attribute cap forces, and the deserializer is where it stops
 * being visible: what comes out is an {@link EventEnvelope}, the same one RabbitMQ produces.
 *
 * ## It unwraps an SNS notification, and that is not defensive programming
 * A subscription created **without** `RawMessageDelivery` wraps every message in a notification of
 * its own, putting the real body in a `Message` **string**. It is one checkbox, it is off by default
 * in the console, and left unhandled the symptom is `messageType` coming back empty on every
 * delivery — the events arrive, no handler matches, and nothing anywhere says the subscription is the
 * reason. Unwrapping it costs four lines and takes a whole class of Friday afternoon out of the
 * system.
 *
 * ## Where the metadata comes from when the body has none
 * From the record's message attributes. A message published by something that is not this library —
 * a console test, a bridge, another team's producer — has no envelope in its body, and the attributes
 * are then the only description of it there is.
 */
export class SqsEventEnvelopeDeserializer extends EventEnvelopeDeserializer {
  deserializeEnvelope(value: unknown, options?: Record<string, unknown>): IncomingEnvelope {
    const notification = asNotification(value);
    const attributes = notification
      ? fromNotificationAttributes(notification.MessageAttributes)
      : ((options?.['attributes'] as EnvelopeMetadata | undefined) ?? {});
    const body = (notification ? parse(notification.Message) : value) as Partial<AwsMessageBody>;

    const metadata = body?.metadata ?? attributes;
    const pattern =
      body?.pattern ?? metadata[AWS_ROUTING_KEY_ATTRIBUTE] ?? attributes[AWS_ROUTING_KEY_ATTRIBUTE];

    return {
      pattern: String(pattern ?? options?.['channel'] ?? ''),
      envelope: new EventEnvelope(body?.data ?? body ?? {}, metadata),
    };
  }
}

const asNotification = (value: unknown): SnsNotification | undefined => {
  const candidate = value as Partial<SnsNotification> | undefined;
  return candidate?.Type === 'Notification' && typeof candidate.Message === 'string'
    ? (candidate as SnsNotification)
    : undefined;
};

const parse = (message: string): unknown => {
  try {
    return JSON.parse(message);
  } catch {
    return { data: message };
  }
};

const fromNotificationAttributes = (
  attributes: SnsNotification['MessageAttributes'],
): EnvelopeMetadata =>
  Object.fromEntries(
    Object.entries(attributes ?? {})
      .filter(([, attribute]) => typeof attribute?.Value === 'string')
      .map(([key, attribute]) => [key, attribute.Value as string]),
  );
