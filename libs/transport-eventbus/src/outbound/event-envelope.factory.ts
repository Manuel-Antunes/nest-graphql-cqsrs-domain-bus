import { Injectable } from '@nestjs/common';
import { AsyncContext } from '@nestjs/cqrs';

import { RequestContextCodec } from '../request-context';
import { injectTraceContext } from '../tracing';
import { TransportIdentity } from '../transport-identity';
import type { EventAddress } from './event-address';
import type { EnvelopeMetadata } from './event-envelope';
import {
  EventEnvelope,
  encodeTags,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
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

  /**
   * The trace is injected **last**, and the order is the point: a service in the middle of a chain
   * hands back what arrived ({@link TransportRequestContext.toAttributes}), and anything of the
   * previous hop's that slipped through is overwritten here by the trace this service is in now.
   * A stale `traceparent` does not break anything visibly — it just reparents this service's work
   * onto the first one, which is the kind of wrongness a trace is supposed to rule out.
   */
  private metadataFor(event: object, address: EventAddress): EnvelopeMetadata {
    const timestamp = (event as { occurredAt?: Date }).occurredAt ?? new Date();
    return injectTraceContext({
      [TRANSPORT_MESSAGE_TYPE]: address.messageType,
      [TRANSPORT_IDENTIFIER]: address.identifier,
      [TRANSPORT_TIMESTAMP]: timestamp.toISOString(),
      [TRANSPORT_ORIGIN]: this.identity.applicationName,
      [TRANSPORT_TAGS]: encodeTags(address.tags),
      ...this.context.encode(AsyncContext.of(event), event),
    });
  }
}
