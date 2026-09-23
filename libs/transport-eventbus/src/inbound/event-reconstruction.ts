import { Logger } from '@nestjs/common';
import {
  eventTypeFor,
  registeredEventTypes,
} from '@nestposts/platform/domain/shared/event-type';

import type { ITransportDataEventBus } from '../interfaces/transport-data.interface';
import type { EnvelopeMetadata } from '../outbound/event-envelope';
import {
  decodeData,
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
} from '../outbound/event-envelope';
import { markIngested } from '../outbound/transport-metadata';

const logger = new Logger('EventReconstruction');

/**
 * **An envelope becomes an event again — as an instance of the real class.**
 *
 * ## Why the real class, and not a named anonymous one
 * Upstream builds `class {}` and forges its `name` to the event's, which was enough for
 * `@nestjs/cqrs` 7: it matched a handler by the event's class name. Version 12 stamps
 * `{ id: randomUUID() }` on the event class when `@EventsHandler(SomeEvent)` is read, and filters
 * published events by that id off the instance's constructor. A forged class has no id, so **nothing**
 * matches it — not a handler, not a saga, not a GraphQL subscription — and the event is dropped
 * without an error.
 *
 * So the class has to be the one the handlers were registered against, and finding it is what the
 * `@EventType` registry is for. The random id also settles a related question: it cannot be the name
 * on the wire, because it is generated per process.
 *
 * ## The instance is built without calling the constructor
 * `Object.create(prototype)` and then the fields. A domain event here is data — its constructor only
 * assigns — and calling it would mean guessing the order of its parameters from a JSON object, which
 * is how a field gets silently assigned to the wrong one. The consequence to know: an event class that
 * *computes* something in its constructor does not get it computed on this side.
 *
 * ## Every event built here is marked
 * With where it came from and under which identifier — which is what tells a message apart from an
 * event this process just raised, and therefore what keeps it from being forwarded straight back out.
 */
export const reconstruct = (envelope: EventEnvelope): object => {
  const declared =
    eventTypeFor(envelope.messageType) ?? byLocalName(envelope.messageType);
  const event = declared
    ? (Object.create(declared.eventClass.prototype) as object)
    : anonymous(envelope.messageType);

  Object.assign(event, envelope.data as Record<string, unknown>);
  markIngested(event, envelope);
  return event;
};

/**
 * **Reads an envelope off whatever arrived**, which is how the same reconstruction serves a delivery,
 * a stored row and upstream's wire shape.
 *
 * It accepts an {@link EventEnvelope} (what this library's deserializers produce), the two properties
 * on their own, and upstream's `{ payload, eventName }` — that last one resolved by local name, so an
 * application publishing upstream's shape keeps working as long as the class declares an `@EventType`.
 *
 * Anything else is refused, loudly and by name: a body with no message type means the transport was
 * wired without one of the {@link EventEnvelopeDeserializer}s, and the alternative to failing here is
 * an event of an unknown type that no handler will ever match.
 */
export const envelopeFrom = (message: unknown): EventEnvelope => {
  if (message instanceof EventEnvelope) {
    return message;
  }
  const raw = parse(message);

  if (isUpstreamShape(raw)) {
    return upstreamEnvelope(raw);
  }
  if (isEnvelopeShape(raw)) {
    return new EventEnvelope(
      decodeData(raw.data),
      raw.metadata as EnvelopeMetadata,
    );
  }
  throw new TypeError(
    `a transport message that is not an envelope: ${JSON.stringify(raw).slice(0, 200)}. Declare an ` +
      `EventEnvelopeDeserializer on the transport's options — the RabbitMQ one reads the metadata ` +
      `off the AMQP headers, and without it there is no message type to resolve the class by.`,
  );
};

/** The event, from whatever arrived: upstream's `@TransportEvent()` in one call. */
export const reconstructEvent = (message: unknown): object =>
  reconstruct(envelopeFrom(message));

const parse = (message: unknown): Record<string, unknown> =>
  typeof message === 'string' || Buffer.isBuffer(message)
    ? (JSON.parse(message.toString()) as Record<string, unknown>)
    : ((message ?? {}) as Record<string, unknown>);

const isUpstreamShape = (raw: Record<string, unknown>): boolean =>
  typeof raw.eventName === 'string' && raw.payload !== undefined;

const isEnvelopeShape = (raw: Record<string, unknown>): boolean =>
  typeof raw.metadata === 'object' &&
  raw.metadata !== null &&
  typeof (raw.metadata as EnvelopeMetadata)[TRANSPORT_MESSAGE_TYPE] ===
    'string';

const upstreamEnvelope = (raw: Record<string, unknown>): EventEnvelope => {
  const { payload, eventName } = raw as unknown as ITransportDataEventBus;
  const declared = byLocalName(eventName);

  return new EventEnvelope(decodeData(payload), {
    [TRANSPORT_MESSAGE_TYPE]: declared?.messageType ?? eventName,
    [TRANSPORT_IDENTIFIER]: `${eventName}:${JSON.stringify(payload)}`,
  });
};

/**
 * The fallback, and upstream's only path: a class named after the event.
 *
 * It is deliberately kept, because it is better than throwing — a service that receives an event it
 * does not declare can still log it, relay it or count it. What it cannot do is *handle* it: no
 * `@EventsHandler` will match, for the reason above. The warning says so once, naming the type, so
 * the missing `@EventType` is findable.
 */
const anonymous = (name: string): object => {
  logger.warn(
    `${name} is not declared with @EventType in this service: the event is reconstructed under its ` +
      `name, but no handler, saga or subscription will match it — @nestjs/cqrs matches by an id it ` +
      `stamps on the event CLASS, and this one is not that class.`,
  );
  const unknownEvent = class {};
  Object.defineProperty(unknownEvent, 'name', { value: name });
  return new unknownEvent();
};

const byLocalName = (eventName: string) =>
  registeredEventTypes().find(
    (metadata) =>
      metadata.name === eventName || metadata.eventClass.name === eventName,
  );
