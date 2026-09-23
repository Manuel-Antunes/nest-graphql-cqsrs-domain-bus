import type { ReadPacket } from '@nestjs/microservices';
import type { InngestOutgoingEvent } from '@nestposts/microservices-inngest/inngest-client.proxy';
import { qualifiedNameIn } from '@nestposts/platform/domain/shared/event-type';

import { CORRELATION_ID } from '../../request-context';
import type { EnvelopeMetadata } from '../event-envelope';
import { EventEnvelope, TRANSPORT_MESSAGE_TYPE } from '../event-envelope';
import { EventEnvelopeSerializer } from './event-envelope.serializer';

/** The session key the request's correlation id is grouped under. */
export const CORRELATION_SESSION = 'correlation_id';

/** What {@link InngestEventEnvelopeSerializer} hands the client: an Inngest event, ready to send. */
export interface InngestEventMessage extends InngestOutgoingEvent {
  readonly user: EnvelopeMetadata;
}

/**
 * **The envelope as an Inngest event: the data is the data, and the metadata is the `user`.**
 *
 * ## Why the name is the qualified name and not the routing key
 * Every other transport here addresses with `namespace.Name.aggregateTag`, and a consumer binds to
 * `posts.#` or `posts.PostCreated.*`. **Inngest matches a trigger by exact event name** — it has no
 * wildcards — so a name carrying the aggregate would mint one event name per post and no function
 * could ever be declared for it. The name is therefore `posts.PostCreated`, and the aggregate stays
 * where the ingestion already reads it from: the metadata. This is the "transport that addresses
 * differently rewrites the pattern in its own serializer" case, and it is the reason that hook
 * exists.
 *
 * ## The correlation id becomes a session
 * `meta.sessions` is Inngest's own grouping, and from inngest-js 4.18 it **propagates by itself** to
 * every event a run sends — which is the same thing `RequestContextCodec` does by hand, done by the
 * platform. Putting the correlation id there makes one saga one thing to look at in Inngest's
 * dashboard, and costs nothing: sessions change nothing about which function runs.
 */
export class InngestEventEnvelopeSerializer extends EventEnvelopeSerializer {
  protected serializeEnvelope(
    envelope: EventEnvelope<Record<string, unknown>>,
    packet: ReadPacket,
  ): InngestEventMessage {
    const messageType = envelope.metadata[TRANSPORT_MESSAGE_TYPE];
    const name = messageType
      ? qualifiedNameIn(messageType)
      : String(packet.pattern);
    const correlationId = envelope.metadata[CORRELATION_ID];

    return {
      name,
      data: envelope.data,
      user: envelope.metadata,
      ...(correlationId
        ? { meta: { sessions: { [CORRELATION_SESSION]: correlationId } } }
        : {}),
    };
  }
}
