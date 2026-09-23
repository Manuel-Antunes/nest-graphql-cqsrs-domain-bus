import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import {
  eventTagsOf,
  eventTypeOf,
} from '@nestposts/platform/domain/shared/event-type';

import { reconstruct } from '../../inbound/event-reconstruction';
import type { EnvelopeMetadata } from '../../outbound/event-envelope';
import {
  decodeData,
  EventEnvelope,
  encodeData,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_TIMESTAMP,
} from '../../outbound/event-envelope';
import { identifierOf } from '../../outbound/transport-metadata';
import { LoggedEvent } from './event-log.entity';

/** One event as the log gives it back: the real class, and where it sits in the one order. */
export interface LoggedRecord {
  readonly position: string;
  readonly event: object;
}

/**
 * **The one thing this library persists: every event, once, in one order.**
 *
 * It answers the two questions an event-sourced service asks, and they are two reads of the same
 * rows rather than two stores:
 *
 * | question | read | who asks |
 * |---|---|---|
 * | what happened to **this aggregate** | {@link readStream} | `EventSourcedRepository`, to replay |
 * | what has **this service** done since | {@link readAfter} | `EventSourcedEventBus`, for subscribers |
 *
 * ## It speaks events, not payloads
 * Everything that crosses this port is an instance of the real event class. The envelope encoding —
 * the same one the wire uses, so a row and a message say the same thing — lives inside the
 * implementation, and nothing above has to know an event was ever a string. That is what lets the
 * repository, the bus and the ingestion talk to one object in one language.
 *
 * ## Why it is a port
 * Because where a log lives is a deployment decision — this service's own database here, a dedicated
 * event store elsewhere — and none of that changes what a command handler does with it.
 */
export abstract class EventLog {
  /**
   * Appends events, filing each under the aggregate its `@EventType({ tags })` names. Appending an
   * identifier the log already has is a no-op, not an error, so a redelivery and a republish cost
   * nothing.
   */
  abstract append(events: readonly object[], streamId?: string): Promise<void>;

  /** One aggregate's history, in order, as instances of the real event classes. */
  abstract readStream(streamId: string): Promise<object[]>;

  /** Everything after this position, oldest first — the service's own order. */
  abstract readAfter(
    position: string,
    limit: number,
    gaps?: readonly string[],
  ): Promise<LoggedRecord[]>;

  /** The last position written, or `'0'` for an empty log — where a new subscriber starts. */
  abstract head(): Promise<string>;
}

/**
 * The log of a service that keeps it in its own database.
 *
 * The statements are native for the reason the inbox's are: `on conflict do nothing` is not something
 * an ORM expresses, and a native statement is **not** resolved against the schema the connection was
 * configured with — so the table is read off the metadata, which is what keeps the raw statement
 * addressing the same table the mapped entity does.
 */
@Injectable()
export class MikroOrmEventLog extends EventLog {
  private readonly logger = new Logger(MikroOrmEventLog.name);

  constructor(private readonly em: EntityManager) {
    super();
  }

  /**
   * Every call opens a MikroORM context if there is none, and joins the one there is.
   *
   * Both callers need that and for opposite reasons. `EventIngestion` appends **inside** its
   * transaction, so this must join it — the inbox row and the append have to commit together.
   * `TransportEventBusService` appends from `publish`, which nothing opened a request for, so the
   * first statement would be refused outright: `Using global EntityManager instance methods for
   * context specific actions is disallowed`. `inRequestContext` is a no-op when a context exists,
   * which is exactly the difference.
   */
  append(events: readonly object[], streamId?: string): Promise<void> {
    return this.at(async () => {
      for (const event of events) {
        await this.appendOne(event, streamId ?? eventTagsOf(event)[0]?.value);
      }
    });
  }

  readStream(streamId: string): Promise<object[]> {
    return this.at(async () => {
      const em = this.em.getContext();
      const rows = await em.getConnection().execute<StoredRow[]>(
        `select identifier, message_type as "messageType", payload, occurred_at as "occurredAt"
           from ${table(em)}
          where stream_id = ?
          order by sequence asc`,
        [streamId],
        'all',
        em.getTransactionContext(),
      );
      return rows.map((row: StoredRow) => eventOf(row));
    });
  }

  readAfter(
    position: string,
    limit: number,
    gaps: readonly string[] = [],
  ): Promise<LoggedRecord[]> {
    return this.at(async () => {
      const em = this.em.getContext();
      const rows = await em
        .getConnection()
        .execute<(StoredRow & { position: string })[]>(
          `select position, identifier, message_type as "messageType", payload,
                occurred_at as "occurredAt"
           from ${table(em)}
          where position > ? or position = any(?::bigint[])
          order by position asc
          limit ?`,
          [position, `{${gaps.join(',')}}`, limit],
          'all',
          em.getTransactionContext(),
        );
      return rows.map((row: StoredRow & { position: string }) => ({
        position: row.position,
        event: eventOf(row),
      }));
    });
  }

  head(): Promise<string> {
    return this.at(async () => {
      const em = this.em.getContext();
      const rows = await em
        .getConnection()
        .execute<{ head: string | null }[]>(
          `select coalesce(max(position), 0)::text as head from ${table(em)}`,
          [],
          'all',
          em.getTransactionContext(),
        );
      return rows[0]?.head ?? '0';
    });
  }

  private at<T>(work: () => Promise<T>): Promise<T> {
    return inRequestContext(this.em, work);
  }

  private async appendOne(event: object, streamId?: string): Promise<void> {
    const em = this.em.getContext();
    const messageType = messageTypeOf(event);

    if (streamId && (await this.startsWith(streamId, messageType))) {
      /*
       * A stream is created once. The same creation arriving again — as another message, with another
       * identifier, which the inbox therefore cannot recognise — would land after the events that
       * followed it, and the replay would read it as the aggregate starting over: version back to 1,
       * a decision this service had already taken taken again. Refusing it here is what keeps the
       * aggregate's own state able to answer.
       */
      this.logger.warn(
        `stream ${streamId} already starts with ${messageType}: the copy that just arrived is not ` +
          `appended, or the replay would read it as the aggregate being created twice`,
      );
      return;
    }

    await em.getConnection().execute(
      `insert into ${table(em)}
              (stream_id, sequence, identifier, message_type, payload, occurred_at)
       values (?, ?, ?, ?, ?, ?)
       on conflict (identifier) do nothing`,
      [
        streamId ?? null,
        streamId ? await this.nextSequence(streamId) : null,
        identifierOf(event),
        messageType,
        JSON.stringify(encodeData(event)),
        (event as { occurredAt?: Date }).occurredAt ?? new Date(),
      ],
      'run',
      em.getTransactionContext(),
    );
  }

  private async startsWith(
    streamId: string,
    messageType: string,
  ): Promise<boolean> {
    const em = this.em.getContext();
    const rows = await em.getConnection().execute<{ messageType: string }[]>(
      `select message_type as "messageType" from ${table(em)}
          where stream_id = ? order by sequence asc limit 1`,
      [streamId],
      'all',
      em.getTransactionContext(),
    );
    return rows[0]?.messageType === messageType;
  }

  private async nextSequence(streamId: string): Promise<number> {
    const em = this.em.getContext();
    const rows = await em
      .getConnection()
      .execute<{ next: number }[]>(
        `select coalesce(max(sequence), -1) + 1 as next from ${table(em)} where stream_id = ?`,
        [streamId],
        'all',
        em.getTransactionContext(),
      );
    return Number(rows[0]?.next ?? 0);
  }
}

interface StoredRow {
  identifier: string;
  messageType: string;
  payload: string;
  occurredAt: Date;
}

const eventOf = (row: StoredRow): object =>
  reconstruct(
    new EventEnvelope(
      decodeData(JSON.parse(row.payload) as Record<string, unknown>),
      {
        [TRANSPORT_MESSAGE_TYPE]: row.messageType,
        [TRANSPORT_IDENTIFIER]: row.identifier,
        [TRANSPORT_TIMESTAMP]: new Date(row.occurredAt).toISOString(),
      } as EnvelopeMetadata,
    ),
  );

const messageTypeOf = (event: object): string =>
  eventTypeOf(event)?.messageType ?? event.constructor.name;

const table = (em: EntityManager): string => {
  const metadata = em.getMetadata().find(LoggedEvent);
  const platform = em.getPlatform();
  const name = platform.quoteIdentifier(metadata?.tableName ?? 'event_log');
  const schema = metadata?.schema ?? em.config.get('schema');
  return schema && schema !== '*'
    ? `${platform.quoteIdentifier(schema)}.${name}`
    : name;
};
