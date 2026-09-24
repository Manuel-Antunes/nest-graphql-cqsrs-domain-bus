import { defineEntity, p } from '@mikro-orm/core';

/**
 * One row per message received from the broker.
 *
 * ## Why it is a mapped entity here, unlike the Quarkus side
 * There, the inbox is native SQL with no `@Entity`. Here it is mapped, because the mapping is what
 * `apps/migrator` diffs to write the migration that creates the table, and what tells the native
 * statement which schema it lives in. The insert itself is still native — see {@link MessageInbox} —
 * because the decision it makes is `on conflict do nothing`, which is not something an ORM expresses.
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
