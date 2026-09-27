import { defineEntity, p } from '@mikro-orm/core';
import type { OutboxAttempt } from '@nestjs/outbox';

import { TRANSPORT_SCHEMA } from '../transport-schema';

/**
 * **A message this service has committed to publish, and has not published yet.** One row per
 * event, written in the transaction of the work that raised it and deleted once a transport took it.
 *
 * ## Why `seq` and not `id` orders it
 * Because order within a key is the order the rows became visible, and only the database knows that:
 * `id` comes from a producer's clock, and two producers' clocks disagree. `seq` is numbered at insert
 * and `MikroOrmOutboxStore.add` makes the transactions adding one key take turns, so it follows
 * commit order.
 *
 * ## Why `producer`
 * Because the `transport` schema is one for every service, and a relay may only publish what its own
 * service produced: the destinations a message is sent through are the producer's outbox transports,
 * and another service has none of them. Every read and write the store makes is scoped by it.
 */
export class OutboxMessageRecord {
  seq!: string;
  id!: string;
  producer!: string;
  topic!: string;
  payload!: unknown;
  headers!: Record<string, string>;
  key!: string | null;
  createdAt!: Date;
  availableAt!: Date;
  attempts!: number;
  lastError!: string | null;
  history!: OutboxAttempt[];
  leaseOwner!: string | null;
  leaseUntil!: Date | null;
}

export const OutboxMessageEntitySchema = defineEntity({
  class: OutboxMessageRecord,
  tableName: 'outbox_messages',
  schema: TRANSPORT_SCHEMA,
  properties: {
    seq: p.bigint('string').primary().autoincrement(),
    id: p.string().columnType('text').unique(),
    producer: p.string().columnType('text'),
    topic: p.string().columnType('text'),
    payload: p.json<unknown>().nullable(),
    headers: p.json<Record<string, string>>(),
    key: p.string().columnType('text').nullable(),
    createdAt: p.datetime(),
    availableAt: p.datetime(),
    attempts: p.integer().default(0),
    lastError: p.text().nullable(),
    history: p.json<OutboxAttempt[]>().defaultRaw(`'[]'`),
    leaseOwner: p.string().columnType('text').nullable(),
    leaseUntil: p.datetime().nullable(),
  },
  indexes: [
    { name: 'outbox_messages_producer_seq', properties: ['producer', 'seq'] },
    {
      name: 'outbox_messages_producer_key_seq',
      properties: ['producer', 'key', 'seq'],
    },
  ],
});

/**
 * **A message the relay gave up on**, with every attempt it made. It keeps the message's `seq`, so a
 * requeue puts it back where it was, ahead of the later messages of its key.
 */
export class OutboxDeadLetterRecord {
  id!: string;
  producer!: string;
  seq!: string;
  topic!: string;
  payload!: unknown;
  headers!: Record<string, string>;
  key!: string | null;
  createdAt!: Date;
  attempts!: number;
  lastError!: string | null;
  history!: OutboxAttempt[];
  reason!: string;
  failedAt!: Date;
}

export const OutboxDeadLetterEntitySchema = defineEntity({
  class: OutboxDeadLetterRecord,
  tableName: 'outbox_dead_letters',
  schema: TRANSPORT_SCHEMA,
  properties: {
    id: p.string().columnType('text').primary(),
    producer: p.string().columnType('text'),
    seq: p.bigint('string'),
    topic: p.string().columnType('text'),
    payload: p.json<unknown>().nullable(),
    headers: p.json<Record<string, string>>(),
    key: p.string().columnType('text').nullable(),
    createdAt: p.datetime(),
    attempts: p.integer(),
    lastError: p.text().nullable(),
    history: p.json<OutboxAttempt[]>(),
    reason: p.string().columnType('text'),
    failedAt: p.datetime(),
  },
  indexes: [
    {
      name: 'outbox_dead_letters_producer_failed_at',
      properties: ['producer', 'failedAt'],
    },
  ],
});

/**
 * **Which consumer processed which message**, keyed by both — so two services ingesting the same
 * event each keep their own memory of it, which the inbox keyed by the message alone could not.
 *
 * `messageType` and `origin` are this repository's, beside the package's three columns: what the
 * message was and which service produced it, written by the ingestion in the same transaction —
 * which is what lets an operator, or a suite, tell a service's own echo from what it should ingest.
 */
export class OutboxInboxRecord {
  consumer!: string;
  messageId!: string;
  processedAt!: Date;
  messageType!: string | null;
  origin!: string | null;
}

export const OutboxInboxEntitySchema = defineEntity({
  class: OutboxInboxRecord,
  tableName: 'outbox_inbox',
  schema: TRANSPORT_SCHEMA,
  properties: {
    consumer: p.string().columnType('text').primary(),
    messageId: p.string().columnType('text').primary(),
    processedAt: p.datetime(),
    messageType: p.string().columnType('text').nullable(),
    origin: p.string().columnType('text').nullable(),
  },
  indexes: [{ name: 'outbox_inbox_processed_at', properties: ['processedAt'] }],
});

/** What a service adds to its MikroORM `entities` for the outbox and the inbox to have tables. */
export const outboxEntities = [
  OutboxMessageEntitySchema,
  OutboxDeadLetterEntitySchema,
  OutboxInboxEntitySchema,
];
