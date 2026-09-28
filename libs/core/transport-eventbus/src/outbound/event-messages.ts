import { Injectable } from '@nestjs/common';
import type { NewOutboxMessage, OutboxEnvelope } from '@nestjs/outbox';

import { SequencingPolicy } from '../eventhandling/sequencing-policy';
import { TagResolver } from '../eventsourcing/tag';
import { instantiate } from '../inbound/event-reconstruction';
import { MessageOriginProvider } from '../messaging/correlation';
import { EventMessage } from '../messaging/event-message';
import type { Metadata } from '../messaging/message';
import { MessageType } from '../messaging/message-type';
import { TransportIdentity } from '../transport-identity';
import { EventAddress } from './event-address';
import type { MessageHeaders } from './message-headers';
import {
  decodeData,
  encodeData,
  encodeTags,
  isTransportMetadata,
  LEGACY_CAUSATION_ID,
  LEGACY_CORRELATION_ID,
  TRANSPORT_EVENT_ID,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_PROCESSING_GROUP,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from './message-headers';
import { isIngested, originOf } from './transport-metadata';

/**
 * **An {@link EventMessage} on the wire, and back** — what an event becomes as a message of
 * `@nestjs/outbox`, and what an `OutboxEnvelope` becomes when it arrives.
 *
 * | | |
 * |---|---|
 * | `id` | the event's identifier — what every consumer's inbox deduplicates by. A message for a streaming processing group has one of its own, `<event>@<group>` |
 * | `topic` | the qualified name, `namespace.Name`, for a destination; `@processing-group` for a streaming processing group, whose name is in the headers |
 * | `key` | the sequence its {@link SequencingPolicy} put it in, within its namespace or group: one sequence's messages are published one at a time, in commit order |
 * | `payload` | the event's fields, encoded once for JSON — a `Date` comes back a `Date` |
 * | `headers` | the message's metadata, key for key, and the framework's own facts beside it: type, timestamp, origin, tags, identifier |
 *
 * The metadata already holds everything that is said about the event — the request it belongs to,
 * its correlation and causation, the trace it was published in — because the dispatch interceptors
 * put it there at the moment it was published; the relay publishes later, in no request at all.
 */
@Injectable()
export class EventMessages {
  constructor(
    private readonly identity: TransportIdentity,
    private readonly tags: TagResolver,
    private readonly sequencing: SequencingPolicy,
  ) {}

  /**
   * The topic of every streaming processing group's messages — one topic, the group in the headers,
   * so a group declared anywhere needs no binding of its own and an event type added later needs none
   * either.
   */
  static readonly GROUP_TOPIC = '@processing-group';

  /**
   * **An envelope, back as the event message it was published as** — the payload an instance of its
   * real class, under the identifier it was raised with, its headers split into the framework's facts
   * and the metadata. Headers of a producer that still wrote the old correlation keys are read as the
   * keys Axon names.
   */
  static read(envelope: OutboxEnvelope): EventMessage {
    const headers = (envelope.headers ?? {}) as MessageHeaders;
    const type = headers[TRANSPORT_MESSAGE_TYPE] ?? envelope.topic;
    const timestamp = headers[TRANSPORT_TIMESTAMP];
    return EventMessage.create(
      instantiate(type, decodeData(envelope.payload)),
      {
        identifier: headers[TRANSPORT_EVENT_ID] ?? envelope.id,
        type: MessageType.parse(type),
        metadata: EventMessages.metadataOf(headers),
        timestamp: timestamp
          ? new Date(timestamp)
          : new Date(envelope.createdAt ?? Date.now()),
      },
    );
  }

  /** The service that produced an envelope. */
  static originOf(envelope: OutboxEnvelope): string | undefined {
    return (envelope.headers as MessageHeaders | undefined)?.[TRANSPORT_ORIGIN];
  }

  /** The streaming processing group an envelope is for, if it is one of theirs. */
  static groupOf(envelope: OutboxEnvelope): string | undefined {
    return (envelope.headers as MessageHeaders | undefined)?.[
      TRANSPORT_PROCESSING_GROUP
    ];
  }

  /**
   * **Who a streaming group's deliveries are, in the inbox** — the service and the group,
   * `posts-api/notifications`. The inbox and the outbox are one table each for every service, so a
   * group is scoped by the service it runs in: two services with a group of the same name, taking the
   * same event, each keep their own message and their own record of having handled it.
   */
  static groupConsumer(service: string, group: string): string {
    return `${service}/${group}`;
  }

  /** The application's headers: every one that is not the framework's, the old correlation keys renamed. */
  static metadataOf(headers: MessageHeaders): Metadata {
    const metadata: Record<string, string> = Object.fromEntries(
      Object.entries(headers).filter(([key]) => !isTransportMetadata(key)),
    );
    const legacyCorrelation = headers[LEGACY_CORRELATION_ID];
    if (legacyCorrelation && !metadata[MessageOriginProvider.CORRELATION_ID]) {
      metadata[MessageOriginProvider.CORRELATION_ID] = legacyCorrelation;
    }
    const legacyCausation = headers[LEGACY_CAUSATION_ID];
    if (legacyCausation && !metadata[MessageOriginProvider.CAUSATION_ID]) {
      metadata[MessageOriginProvider.CAUSATION_ID] = legacyCausation;
    }
    return metadata;
  }

  /** Where a message goes: its type, identifier, tags and sequence. */
  addressOf(message: EventMessage): EventAddress {
    const tags = this.tags.resolve(message);
    return EventAddress.of(
      message,
      tags,
      this.sequencing.sequenceIdentifierFor(message, tags) ??
        EventAddress.NO_AGGREGATE,
    );
  }

  /**
   * **The message an event becomes for its namespace's destination** — or `undefined` when it stays
   * here: this service does not publish, the event came from elsewhere (publishing it again is the
   * loop the origin mark exists to cut), or no destination takes its namespace.
   */
  forDestination(
    message: EventMessage,
    destinations: ReadonlySet<string>,
  ): NewOutboxMessage | undefined {
    if (!this.identity.publishes || isIngested(message.payload)) {
      return undefined;
    }
    const address = this.addressOf(message);
    if (!destinations.has(address.namespace)) {
      return undefined;
    }
    return {
      id: address.identifier,
      topic: address.qualifiedName,
      key: `${address.namespace}/${address.orderingKey}`,
      payload: encodeData(message.payload),
      headers: this.headersOf(message, address),
    };
  }

  /**
   * **The message an event becomes for a streaming processing group** — one per group, so each group
   * has its own place in the relay's order, its own retries and its own dead letters, and one group
   * failing does not hold back another: Axon's processors each keep their own token. An event that
   * came from another service keeps that service as its origin, so the group sees it as ingested.
   */
  forGroup(message: EventMessage, group: string): NewOutboxMessage {
    const address = this.addressOf(message);
    return {
      id: `${address.identifier}@${EventMessages.groupConsumer(this.identity.applicationName, group)}`,
      topic: EventMessages.GROUP_TOPIC,
      key: `${EventMessages.GROUP_TOPIC}/${group}/${address.orderingKey}`,
      payload: encodeData(message.payload),
      headers: {
        ...this.headersOf(message, address),
        [TRANSPORT_ORIGIN]:
          originOf(message.payload) ?? this.identity.applicationName,
        [TRANSPORT_PROCESSING_GROUP]: group,
      },
    };
  }

  private headersOf(
    message: EventMessage,
    address: EventAddress,
  ): MessageHeaders {
    return {
      ...message.metadata,
      [TRANSPORT_MESSAGE_TYPE]: address.messageType,
      [TRANSPORT_TIMESTAMP]: message.timestamp.toISOString(),
      [TRANSPORT_ORIGIN]: this.identity.applicationName,
      [TRANSPORT_TAGS]: encodeTags(address.tags),
      [TRANSPORT_EVENT_ID]: address.identifier,
    };
  }
}
