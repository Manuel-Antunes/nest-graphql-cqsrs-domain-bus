import { defineEntity, p } from '@mikro-orm/core';

/**
 * **One row per event this service knows, in one order, filed under the aggregate it is about.**
 *
 * It used to be two tables. `event_log` was keyed by `(stream_id, sequence)` and answered "what
 * happened to this aggregate"; `transport_event_feed` was keyed by a global `position` and answered
 * "what has this service done lately". They held the same columns, written from the same events, by
 * two code paths with two different guarantees — and a subscriber and a replay could disagree about
 * an event that one of them had and the other had not.
 *
 * They are the same rows under two indexes, which is exactly the shape an event store has: Axon reads
 * one store by `aggregateIdentifier + sequenceNumber` to replay and by `globalIndex` to track. So
 * there is one table, and the two questions are two orders over it.
 *
 * ## Why the position is a `bigint` read as a **string**
 * Because that is what it is. The `pg` driver returns a bigint as a string — `count(*)` has caught
 * people in this repository before — and a property typed `number` would be a lie that works until
 * the table passes `Number.MAX_SAFE_INTEGER`. Declared as a string, the cursor is compared by
 * Postgres, where the comparison is correct, and nothing in TypeScript has to pretend.
 *
 * ## Why the stream is nullable
 * Because not every event is about an aggregate. One with no `@EventType({ tags })` has no stream to
 * belong to and is still a fact this service published: it gets a position and no stream, so a
 * subscriber sees it and no replay is confused by it. Postgres allows many rows with a null in a
 * unique index, which is what makes `(stream_id, sequence)` still enforce one sequence per stream.
 */
export class LoggedEvent {
  position!: string;
  streamId!: string | null;
  sequence!: number | null;
  identifier!: string;
  messageType!: string;
  payload!: string;
  occurredAt!: Date;
}

export const LoggedEventEntitySchema = defineEntity({
  class: LoggedEvent,
  tableName: 'event_log',
  properties: {
    position: p.bigint('string').primary().autoincrement(),
    streamId: p.string().nullable(),
    sequence: p.integer().nullable(),
    identifier: p.string().unique(),
    messageType: p.string(),
    payload: p.text(),
    occurredAt: p.datetime(),
  },
  uniques: [{ properties: ['streamId', 'sequence'] }],
});

/**
 * What a service adds to its MikroORM `entities` for the log to have a table. A service that neither
 * replays an aggregate nor serves subscriptions across processes needs none of it.
 */
export const eventLogEntities = [LoggedEventEntitySchema];
