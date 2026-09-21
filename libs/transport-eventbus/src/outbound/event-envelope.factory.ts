import { Injectable } from '@nestjs/common';
import { AsyncContext } from '@nestjs/cqrs';
import { RequestContextCodec } from '../request-context';
import { TransportIdentity } from '../transport-identity';
import type { EventAddress } from './event-address';
import {
  type EnvelopeMetadata,
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
  encodeTags,
} from './event-envelope';

/**
 * **The envelope around an event, built once and sent to every destination that takes it.**
 *
 * It is the one place that knows what this service says about a message it produces, and it is
 * deliberately not a serializer: what goes in the metadata is the same on RabbitMQ, on Kafka and in
 * process, while *where* the metadata goes — headers, a record, the body — is each transport's
 * business ({@link EventEnvelopeSerializer}).
 */
@Injectable()
export class EventEnvelopeFactory {
  constructor(
    private readonly identity: TransportIdentity,
    private readonly context: RequestContextCodec,
  ) {}

  of(event: object, address: EventAddress): EventEnvelope<object> {
    return new EventEnvelope(event, this.metadataFor(event, address));
  }

  private metadataFor(event: object, address: EventAddress): EnvelopeMetadata {
    const timestamp = (event as { occurredAt?: Date }).occurredAt ?? new Date();
    return {
      [TRANSPORT_MESSAGE_TYPE]: address.messageType,
      [TRANSPORT_IDENTIFIER]: address.identifier,
      [TRANSPORT_TIMESTAMP]: timestamp.toISOString(),
      [TRANSPORT_ORIGIN]: this.identity.applicationName,
      [TRANSPORT_TAGS]: encodeTags(address.tags),
      ...this.context.encode(AsyncContext.of(event), event),
    };
  }
}
