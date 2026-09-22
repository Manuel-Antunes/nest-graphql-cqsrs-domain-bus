import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { eventTypeOf } from '@nestposts/platform/domain/shared/event-type';
import { reconstruct } from '../../inbound/event-reconstruction';
import {
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_TIMESTAMP,
  decodeData,
  encodeData,
} from '../../outbound/event-envelope';
import { identifierOf } from '../../outbound/transport-metadata';
import { StoredEvent } from './event-store.entity';

/**
 * **The stream of an aggregate, as this service knows it.** One append-only log per aggregate, holding
 * the events it received and the ones it decided.
 *
 * ## Why this is part of the framework and not of an application
 * Because a service that reacts to another service's aggregate has no table for it, and therefore
 * nothing to load a decision from: what it has is the events. Rebuilding the aggregate from them is
 * not that service's business logic — it is the same mechanism every time, in the same shape as the
 * {@link MessageInbox} beside it, speaking the same payload format as the envelope
 * ({@link EventEnvelope.encodePayload}). An application that had to write it would be writing the
 * framework, one copy per service.
 *
 * ## Why it is a port
 * Because where a stream lives is a deployment decision — the service's own database here, a dedicated
 * event store or an event-store server elsewhere — and none of that changes what a command handler
 * does with it. {@link MikroOrmEventStore} is the implementation for a service that already has an
 * `EntityManager`.
 */
export abstract class EventStore {
  /** The stream, in order, as instances of the real event classes. */
  abstract read(streamId: string): Promise<object[]>;

  /** Appends to the end of the stream. A creation that the stream already starts with is dropped. */
  abstract append(streamId: string, events: readonly object[]): Promise<void>;
}

/**
 * The event store of a service that keeps its streams in its own database.
 *
 * The events are stored as the envelope encodes them, and read back through {@link reconstruct} — so an
 * event that crossed the wire and an event this service raised are the same row, and a replay answers
 * with instances of the real classes rather than with data.
 */
@Injectable()
export class MikroOrmEventStore extends EventStore {
  private readonly logger = new Logger(MikroOrmEventStore.name);

  constructor(private readonly em: EntityManager) {
    super();
  }

  async read(streamId: string): Promise<object[]> {
    const rows = await this.em
      .getContext()
      .find(StoredEvent, { streamId }, { orderBy: { sequence: 'asc' } });

    return rows.map((row) =>
      reconstruct(
        new EventEnvelope(decodeData(JSON.parse(row.payload)), {
          [TRANSPORT_MESSAGE_TYPE]: row.messageType,
          [TRANSPORT_IDENTIFIER]: row.identifier,
          [TRANSPORT_TIMESTAMP]: row.occurredAt.toISOString(),
        }),
      ),
    );
  }

  async append(streamId: string, events: readonly object[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const em = this.em.getContext();
    const first = await em.findOne(StoredEvent, { streamId }, { orderBy: { sequence: 'asc' } });
    const last = await em.findOne(StoredEvent, { streamId }, { orderBy: { sequence: 'desc' } });
    let sequence = (last?.sequence ?? -1) + 1;

    for (const event of events) {
      if (first && messageTypeOf(event) === first.messageType) {
        /*
         * A stream is created once. The same creation arriving again — as another message, with
         * another identifier, which the inbox therefore cannot recognise — would land after the
         * events that followed it, and the replay would read it as the aggregate starting over:
         * version back to 1, a decision this service had already taken taken again. Refusing it here
         * is what keeps the aggregate's own state able to answer.
         */
        this.logger.warn(
          `stream ${streamId} already starts with ${first.messageType}: the copy that just arrived ` +
            `is not appended, or the replay would read it as the aggregate being created twice`,
        );
        continue;
      }
      const row = new StoredEvent();
      row.streamId = streamId;
      row.sequence = sequence++;
      row.identifier = identifierOf(event);
      row.messageType = messageTypeOf(event);
      row.payload = JSON.stringify(encodeData(event));
      row.occurredAt = (event as { occurredAt?: Date }).occurredAt ?? new Date();
      em.persist(row);
      this.logger.debug(`stream ${streamId} ← ${row.messageType} at ${row.sequence}`);
    }
    await em.flush();
  }
}

const messageTypeOf = (event: object): string =>
  eventTypeOf(event)?.messageType ?? event.constructor.name;
