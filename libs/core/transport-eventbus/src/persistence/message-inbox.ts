import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';

import { TransportMessage } from './message-inbox.entity';

/** One message as the inbox remembers it. */
export interface ReceivedMessage {
  readonly identifier: string;
  readonly messageType: string;
  readonly origin: string | null;
}

/**
 * The memory of "I have already ingested this message". One row per message received from a transport,
 * written in the **same transaction** as the work the message caused.
 *
 * ## Why it has to exist
 * Because no broker delivers exactly once. RabbitMQ guarantees *at least* once: a nack, a consumer
 * restarting before the ack, a requeue on timeout — all redeliver the SAME message. And applying the
 * same event twice is not waste, it is **wrong state**: a decision taken twice.
 *
 * The envelope's metadata cannot stand in for this: it travels with the message, and a redelivery
 * brings the same metadata. What knows what it has already processed is the service, and that memory
 * has to survive a restart. It is the piece upstream does not have, and the reason an at-least-once
 * transport is safe to receive here.
 *
 * ## Why `on conflict do nothing`, and not a query first
 * Because select-then-insert has a race: two deliveries both pass the query before either inserts, and
 * both do the work. The conditional insert settles it in the database, which is the only place the
 * decision is serialisable — and the number of affected rows **is** the answer.
 *
 * ## Why the connection and not the ORM
 * Because `on conflict do nothing` is not something an ORM expresses, and because the answer this
 * needs is the row count, which `persist`/`flush` does not give. The statement goes through the
 * transaction context of the entity manager it runs in, which is what puts it in the same commit as
 * the sink's work.
 *
 * ## Why the port is separate from this implementation
 * Because the outbound half of this library needs no database at all — upstream's does not have one —
 * and a library that demanded an `EntityManager` to publish an event would be a library that cannot
 * be used the way upstream's is. An application that ingests passes the implementation it wants:
 * `inbox: MikroOrmMessageInbox` for the one below.
 */
export abstract class MessageInbox {
  /**
   * @returns `true` when the message is new (and therefore has to be acted on), `false` when it had
   *   already been ingested — in which case acknowledging the delivery and dropping it is the correct
   *   behaviour, not an error.
   */
  abstract register(
    identifier: string,
    messageType: string,
    origin?: string,
  ): Promise<boolean>;

  /**
   * **Forgets a message it registered**, so its redelivery is new again.
   *
   * The row commits before the work the message sets off has finished — the saga and its command run
   * after the ingestion's transaction, on purpose — so when that work fails the message is still
   * remembered as done, and the transport's retry would be dropped as a duplicate. The ingestion calls
   * this when it rethrows, which is what turns a failed reaction into a delivery worth making again.
   */
  abstract forget(identifier: string): Promise<void>;

  /** What this service has ingested, newest first. */
  abstract received(): Promise<ReceivedMessage[]>;
}

/**
 * The inbox of a service that keeps no memory of what it received.
 *
 * It is a null object and not the absence of a binding, because the absence would have to be an option
 * somewhere. What it costs is stated plainly: with no memory, a redelivery is ingested again, and the
 * only guard left is the aggregate's own state. That is enough for a service whose handlers are
 * idempotent by construction, and it is the right choice for one that has no database at all.
 */
@Injectable()
export class NoMessageInbox extends MessageInbox {
  async register(): Promise<boolean> {
    return true;
  }

  async forget(): Promise<void> {}

  async received(): Promise<ReceivedMessage[]> {
    return [];
  }
}

/**
 * The inbox on MikroORM, which is the ORM this repository uses.
 *
 * ## Why the table name is read off the metadata
 * Because the statement is native, and a native statement is not resolved against the schema the
 * connection was configured with: `insert into transport_message_inbox` reaches whatever the
 * `search_path` finds, which in a service that lives in a schema of its own is nothing at all. Asking
 * the metadata for the table — and for the schema MikroORM assigned it — is what keeps the raw
 * statement addressing the same table the mapped entity does.
 */
@Injectable()
export class MikroOrmMessageInbox extends MessageInbox {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async register(
    identifier: string,
    messageType: string,
    origin?: string,
  ): Promise<boolean> {
    const em = this.em.getContext();
    const affected = await em.getConnection().execute(
      `insert into ${table(em)} (identifier, message_type, origin, received_at)
       values (?, ?, ?, ?)
       on conflict (identifier) do nothing`,
      [identifier, messageType, origin ?? null, new Date()],
      'run',
      em.getTransactionContext(),
    );
    return rowsIn(affected) === 1;
  }

  async forget(identifier: string): Promise<void> {
    const em = this.em.getContext();
    await em
      .getConnection()
      .execute(
        `delete from ${table(em)} where identifier = ?`,
        [identifier],
        'run',
        em.getTransactionContext(),
      );
  }

  async received(): Promise<ReceivedMessage[]> {
    const em = this.em.getContext();
    return em.getConnection().execute(
      `select identifier, message_type as "messageType", origin from ${table(em)}
         order by received_at desc, identifier`,
      [],
      'all',
      em.getTransactionContext(),
    );
  }
}

const table = (em: EntityManager): string => {
  const metadata = em.getMetadata().find(TransportMessage);
  const platform = em.getPlatform();
  const name = platform.quoteIdentifier(
    metadata?.tableName ?? 'transport_message_inbox',
  );
  const schema = metadata?.schema ?? em.config.get('schema');
  return schema && schema !== '*'
    ? `${platform.quoteIdentifier(schema)}.${name}`
    : name;
};

/**
 * Drivers disagree on what an `execute(..., 'run')` gives back — `affectedRows` on some, `changes` on
 * others, an array of results on others still. Reading all three keeps the library from having an
 * opinion about the database behind it.
 */
const rowsIn = (result: unknown): number => {
  const outcome =
    (Array.isArray(result)
      ? (result[0] as Record<string, unknown>)
      : (result as Record<string, unknown>)) ?? {};
  const affected = outcome.affectedRows ?? outcome.changes ?? outcome.rowCount;
  return typeof affected === 'number' ? affected : 0;
};
