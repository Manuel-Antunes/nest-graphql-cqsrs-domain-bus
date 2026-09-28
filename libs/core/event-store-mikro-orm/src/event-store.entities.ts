import { defineEntity, p } from '@mikro-orm/core';
import { TRANSPORT_SCHEMA } from '@nestposts/database';

export const StoredEventEntitySchema = defineEntity({
  name: 'StoredEvent',
  tableName: 'event_log',
  schema: TRANSPORT_SCHEMA,
  properties: {
    position: p.bigint('string').primary().autoincrement(),
    identifier: p.string().unique(),
    messageType: p.string(),
    payload: p.text(),
    metadata: p.json<Record<string, string>>().defaultRaw(`'{}'`),
    occurredAt: p.datetime(),
    tags: p.array().defaultRaw(`'{}'`),
    tenant: p.string().nullable(),
  },
  indexes: [{ name: 'event_log_tags_gin', properties: ['tags'], type: 'gin' }],
});

/**
 * **One row per event this service knows, in one order, filed under every tag it carries.**
 *
 * It is Axon 5's event store with a dynamic consistency boundary: there are no streams. An event is
 * about whatever its tags say — `postId=9f1d…`, and as many others as it is about — and a decision
 * reads the events whose tags it cares for and appends on condition that none of them changed. The
 * `tags` column is a `text[]` of `key=value`, and the GIN index is what makes "every event carrying
 * all of these tags" an index lookup.
 *
 * ## Why the position is a `bigint` read as a **string**
 * Because that is what it is. The `pg` driver returns a bigint as a string, and a property typed
 * `number` would be a lie that works until the table passes `Number.MAX_SAFE_INTEGER`. The cursor is
 * compared by Postgres, where the comparison is correct.
 *
 * ## Why the metadata is kept
 * Because an event read back is read by somebody who was not there when it was published: a
 * subscription served by another container, a replay a week later. The metadata is the request it was
 * published in — its correlation, the tenant, the trace — as Axon keeps it beside every event.
 *
 * ## Why it says which tenant
 * Because it is one store for every tenant, in the transport's own schema, and a subscription must
 * only hear its own tenant's events. The column is the tenant whose entity manager the event was
 * appended in, and a row read back whose metadata names no tenant is given that one.
 */
export class StoredEvent extends StoredEventEntitySchema.class {}

/**
 * What a service adds to its MikroORM `entities` for the event store to have a table —
 * `MikroOrmEventStoreModule` maps it wherever it is imported.
 */
export const eventStoreEntities = [StoredEventEntitySchema];
