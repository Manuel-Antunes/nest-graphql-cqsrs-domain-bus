import { Logger } from '@nestjs/common';
import type { OutboxEnvelope } from '@nestjs/outbox';
import {
  eventTypeFor,
  registeredEventTypes,
} from '@nestposts/platform/domain/shared/event-type';

import type { MessageHeaders } from '../outbound/message-headers';
import {
  decodeData,
  decodeTags,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
} from '../outbound/message-headers';
import type { Ingestion } from '../outbound/transport-metadata';
import { markIdentified, markIngested } from '../outbound/transport-metadata';

const logger = new Logger('EventReconstruction');

/**
 * **What arrived, read as a message**: the envelope's `id` is the identifier every inbox keys by,
 * its headers are what the producer said about the event — which type it is, who produced it, which
 * aggregate it is about, the request it belongs to.
 */
export const messageOf = (envelope: OutboxEnvelope): Ingestion => {
  const headers = (envelope.headers ?? {}) as MessageHeaders;
  return {
    origin: headers[TRANSPORT_ORIGIN],
    identifier: envelope.id,
    messageType: headers[TRANSPORT_MESSAGE_TYPE] ?? envelope.topic,
    metadata: headers,
    tags: decodeTags(headers[TRANSPORT_TAGS]),
  };
};

/**
 * **The `OutboxEnvelope` a controller was handed**, checked: `@EventPattern` handlers take it with
 * `@Payload()`, and a payload that is not one is a wiring mistake — a producer that is not an outbox,
 * or a transport whose deserializer changed the shape — refused by name rather than ingested as
 * nothing.
 */
export const envelopeOf = (value: unknown): OutboxEnvelope => {
  const candidate = (
    typeof value === 'string' || Buffer.isBuffer(value)
      ? JSON.parse(value.toString())
      : value
  ) as Partial<OutboxEnvelope> | undefined;
  if (
    typeof candidate?.id !== 'string' ||
    typeof candidate.topic !== 'string' ||
    typeof candidate.headers !== 'object' ||
    candidate.headers === null
  ) {
    throw new TypeError(
      `a transport message that is not an OutboxEnvelope: ${JSON.stringify(value)?.slice(0, 200)}. ` +
        'Every event here is published by @nestjs/outbox, whose ClientProxyTransport sends ' +
        '{ id, topic, key, headers, createdAt, payload } — take it with @Payload().',
    );
  }
  return candidate as OutboxEnvelope;
};

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
 * `@EventType` registry is for.
 *
 * ## The instance is built without calling the constructor
 * `Object.create(prototype)` and then the fields. A domain event here is data — its constructor only
 * assigns — and calling it would mean guessing the order of its parameters from a JSON object, which
 * is how a field gets silently assigned to the wrong one.
 *
 * ## Every event built here is marked
 * With where it came from and under which identifier — which is what tells a message apart from an
 * event this process just raised, and therefore what keeps it from being published straight back out.
 */
export const reconstruct = (envelope: OutboxEnvelope): object =>
  rebuild(messageOf(envelope), decodeData(envelope.payload));

/** The same, from a message and its fields already decoded — a row of the event log, say. */
export const rebuild = (
  message: Ingestion,
  fields: Record<string, unknown>,
): object => {
  const event = instantiate(message.messageType, fields);
  markIngested(event, message);
  return event;
};

/**
 * **An envelope this service published, back as the event it raised** — the real class, under the
 * identifier it was published with, and **not** marked as ingested: it is this service's own
 * decision, read back from its own outbox by the `local` transport ({@link LocalDelivery}). A saga
 * that acts on local decisions only, or a projection that only replays another service's, asks
 * `isIngested` and must get the answer it would have got at the commit.
 */
export const restore = (envelope: OutboxEnvelope): object => {
  const message = messageOf(envelope);
  const event = instantiate(message.messageType, decodeData(envelope.payload));
  markIdentified(event, message.identifier);
  return event;
};

const instantiate = (
  messageType: string,
  fields: Record<string, unknown>,
): object => {
  const declared = eventTypeFor(messageType) ?? byLocalName(messageType);
  const event = declared
    ? (Object.create(declared.eventClass.prototype) as object)
    : anonymous(messageType);
  Object.assign(event, fields);
  return event;
};

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
