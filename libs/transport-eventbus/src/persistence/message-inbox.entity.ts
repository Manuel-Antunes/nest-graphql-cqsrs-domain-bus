import { defineEntity, p } from '@mikro-orm/core';

/**
 * One row per message received from the broker.
 *
 * ## Why it is a mapped entity here, unlike the Quarkus side
 * There, the inbox is native SQL with no `@Entity`, because the schema comes from a migration and a
 * mapping would be one more thing to keep in step with it. Here there are no migrations: the schema
 * is generated from the metadata, so a table nobody maps is a table that does not exist. The insert
 * is still native — see {@link MessageInbox} — because the decision it makes is `on conflict do
 * nothing`, which is not something an ORM expresses.
 */
export class TransportMessage {
  identifier!: string;
  messageType!: string;
  origin?: string;
  receivedAt!: Date;
}

export const TransportMessageEntitySchema = defineEntity({
  class: TransportMessage,
  tableName: 'transport_message_inbox',
  properties: {
    identifier: p.string().primary(),
    messageType: p.string(),
    origin: p.string().nullable(),
    receivedAt: p.datetime(),
  },
});

/** What an application adds to its MikroORM `entities` so the inbox has a table. */
export const transportEntities = [TransportMessageEntitySchema];
