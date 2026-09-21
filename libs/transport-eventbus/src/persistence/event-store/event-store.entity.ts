import { defineEntity, p } from '@mikro-orm/core';

/**
 * One row per event in a stream: the same payload the envelope carries, kept instead of sent.
 *
 * ## Why the identifier is unique
 * Because a stream holds a fact once. The identifier is the one the message travelled under — the same
 * one the inbox remembers — so a redelivery that somehow reaches the append is refused by the
 * database, which is the only place that decision is serialisable.
 *
 * ## Why `(streamId, sequence)` is the key
 * Because a replay is an ordered read, and the order has to be a fact of the data rather than of the
 * query plan. The sequence is per stream, from zero, which is what makes "the third event of this
 * aggregate" a thing one can point at.
 */
export class StoredEvent {
  streamId!: string;
  sequence!: number;
  identifier!: string;
  messageType!: string;
  payload!: string;
  occurredAt!: Date;
}

export const StoredEventEntitySchema = defineEntity({
  class: StoredEvent,
  tableName: 'event_log',
  properties: {
    streamId: p.string().primary(),
    sequence: p.integer().primary(),
    identifier: p.string().unique(),
    messageType: p.string(),
    payload: p.text(),
    occurredAt: p.datetime(),
  },
});

/**
 * What a service that event-sources adds to its MikroORM `entities`. It is separate from
 * `transportEntities` because a service that owns a read model has no stream to keep, and a table
 * nobody writes should not exist.
 */
export const eventStoreEntities = [StoredEventEntitySchema];
