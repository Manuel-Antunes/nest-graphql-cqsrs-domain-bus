import { createHash } from 'node:crypto';
import type { EntityName } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/core';
import type {
  OutboxClaimRequest,
  OutboxDeadLetter,
  OutboxDeadLetterFilter,
  OutboxDeadLetterQuery,
  OutboxDeadLetterReason,
  OutboxDeadLetterUpdate,
  OutboxInboxStore,
  OutboxMessage,
  OutboxRescheduleUpdate,
  OutboxStorage,
  OutboxStore,
  OutboxStoreStats,
} from '@nestjs/outbox';
import { OutboxTransactionRequiredError } from '@nestjs/outbox';

import {
  OutboxDeadLetterRecord,
  OutboxInboxRecord,
  OutboxMessageRecord,
} from './outbox.entities';

/**
 * The advisory lock classes of the two-key form, which no other code in this repository takes: the
 * tenancy and the user provisioning lock with the single-key form, whose key space does not overlap.
 */
const CLAIM_LOCK = 20_260_901;
const KEY_LOCK = 20_260_902;

interface MessageRow {
  seq: string;
  id: string;
  topic: string;
  payload: unknown;
  headers: Record<string, string>;
  key: string | null;
  created_at: Date;
  available_at: Date;
  attempts: number;
  last_error: string | null;
  history: OutboxDeadLetter['history'];
}

interface DeadLetterRow extends Omit<MessageRow, 'available_at'> {
  reason: OutboxDeadLetterReason;
  failed_at: Date;
}

interface Tables {
  readonly messages: string;
  readonly deadLetters: string;
  readonly inbox: string;
}

/**
 * **`@nestjs/outbox`'s two storage contracts on MikroORM and PostgreSQL**: the messages and their
 * dead letters (`OutboxStore`), and every consumer's inbox (`OutboxInboxStore`).
 *
 * It is the TypeORM and Drizzle stores of the package's documentation, statement for statement, in
 * native SQL through the connection — the rules are all conditional writes and row locks, which is
 * what an ORM's unit of work cannot express and a statement can:
 *
 * - `add()` writes through the caller's transaction and takes an advisory lock per key in it, so the
 *   rows of one key are numbered in the order their transactions commit;
 * - `claim()` leases due rows with `FOR UPDATE SKIP LOCKED`, never a key's row ahead of an older one,
 *   and takes a last look at each row's predecessor before it commits;
 * - every write a relay makes is fenced by the lease owner in the statement that writes;
 * - `recordInbox()` is `on conflict do nothing` on `(consumer, message_id)`, so a concurrent delivery
 *   waits for the first transaction and then sees its row.
 *
 * ## Scoped by producer
 * One `transport` schema serves every service, and a relay may only publish what its own service
 * produced — the destinations are the producer's outbox transports. So every message and dead letter
 * carries its `producer`, and the store reads and writes only its own. The inbox is not scoped: its
 * key already names the consumer.
 *
 * ## Why the tables are read off the metadata
 * A native statement is not resolved against the schema the entity is mapped to, and a spec maps
 * every table onto a schema of its own: the metadata says where each table is.
 *
 * ## How it is registered
 * `MikroOrmOutboxModule` builds it and it registers itself with the application's `OutboxStorage`,
 * for both contracts. A transaction handle is the `EntityManager` of an open transaction — the fork
 * `MikroOrmTransactionManager` hands a unit of work, or the global one while that transaction is
 * its context.
 */
export class MikroOrmOutboxStore
  implements OutboxStore<EntityManager>, OutboxInboxStore<EntityManager>
{
  private tables?: Tables;

  constructor(
    private readonly em: EntityManager,
    readonly producer: string,
    storage?: OutboxStorage,
  ) {
    storage?.registerSource({ messages: this, inbox: this });
  }

  async add(
    tx: EntityManager,
    messages: readonly OutboxMessage[],
  ): Promise<void> {
    const em = MikroOrmOutboxStore.transactionOf(tx);
    if (messages.length === 0) {
      return;
    }

    for (const lock of this.keyLocks(messages)) {
      await this.run(em, 'select pg_advisory_xact_lock(?, ?)', [
        KEY_LOCK,
        lock,
      ]);
    }
    await this.run(
      em,
      `insert into ${this.table('messages')}
         (id, producer, topic, payload, headers, key, created_at, available_at)
       values ${messages.map(() => '(?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)').join(', ')}`,
      messages.flatMap((message) => [
        message.id,
        this.producer,
        message.topic,
        json(message.payload),
        json(message.headers),
        message.key,
        new Date(message.createdAt),
        new Date(message.availableAt),
      ]),
    );
  }

  claim({
    owner,
    now,
    leaseMs,
    limit,
  }: OutboxClaimRequest): Promise<OutboxMessage[]> {
    return this.transactional(async (em) => {
      await this.run(em, 'select pg_advisory_xact_lock(?, ?)', [
        CLAIM_LOCK,
        hash(this.producer),
      ]);
      const at = new Date(now);
      const due = await this.run<{ seq: string }>(
        em,
        `select m.seq from ${this.table('messages')} m
          where ${this.claimable('m')}
          order by m.seq
          limit ?
          for update skip locked`,
        [...this.claimableParams(at), limit],
      );
      if (due.length === 0) {
        return [];
      }

      const seqs = due.map((row) => row.seq);
      await this.run(
        em,
        `update ${this.table('messages')} set lease_owner = ?, lease_until = ?
          where seq = any(?::bigint[])`,
        [owner, new Date(now + leaseMs), pgArray(seqs)],
      );

      const rows = await this.run<
        MessageRow & { behind_other: boolean | null }
      >(
        em,
        `select m.*,
                (select o.lease_owner is distinct from ?
                   from ${this.table('messages')} o
                  where o.producer = m.producer and o.key = m.key and o.seq < m.seq
                  order by o.seq desc
                  limit 1) as behind_other
           from ${this.table('messages')} m
          where m.seq = any(?::bigint[])
          order by m.seq`,
        [owner, pgArray(seqs)],
      );

      const blocked = new Set<string>();
      const giveBack: string[] = [];
      const batch: OutboxMessage[] = [];
      for (const row of rows) {
        if (
          row.key !== null &&
          (row.behind_other === true || blocked.has(row.key))
        ) {
          blocked.add(row.key);
          giveBack.push(row.seq);
        } else {
          batch.push(toMessage(row));
        }
      }
      if (giveBack.length > 0) {
        await this.run(
          em,
          `update ${this.table('messages')} set lease_owner = null, lease_until = null
            where seq = any(?::bigint[])`,
          [pgArray(giveBack)],
        );
      }
      return batch;
    });
  }

  async markPublished(id: string, owner: string): Promise<boolean> {
    const deleted = await this.run(
      this.fork(),
      `delete from ${this.table('messages')}
        where id = ? and producer = ? and lease_owner = ?
        returning id`,
      [id, this.producer, owner],
    );
    return deleted.length === 1;
  }

  async reschedule(
    id: string,
    owner: string,
    update: OutboxRescheduleUpdate,
  ): Promise<boolean> {
    const updated = await this.run(
      this.fork(),
      `update ${this.table('messages')}
          set attempts = ?, available_at = ?, last_error = ?,
              history = history || ?::jsonb,
              lease_owner = null, lease_until = null
        where id = ? and producer = ? and lease_owner = ?
        returning id`,
      [
        update.attempts,
        new Date(update.availableAt),
        update.error.error,
        json([update.error]),
        id,
        this.producer,
        owner,
      ],
    );
    return updated.length === 1;
  }

  deadLetter(
    id: string,
    owner: string,
    update: OutboxDeadLetterUpdate,
  ): Promise<boolean> {
    return this.transactional(async (em) => {
      const [row] = await this.run<MessageRow>(
        em,
        `select * from ${this.table('messages')}
          where id = ? and producer = ? and lease_owner = ?
          for update`,
        [id, this.producer, owner],
      );
      if (!row) {
        return false;
      }
      await this.run(
        em,
        `delete from ${this.table('messages')} where seq = ?`,
        [row.seq],
      );
      await this.run(
        em,
        `insert into ${this.table('deadLetters')}
           (id, producer, seq, topic, payload, headers, key, created_at, attempts, last_error,
            history, reason, failed_at)
         values (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?::jsonb, ?, ?)
         on conflict (id) do update set
           producer = excluded.producer, seq = excluded.seq, topic = excluded.topic,
           payload = excluded.payload, headers = excluded.headers, key = excluded.key,
           created_at = excluded.created_at, attempts = excluded.attempts,
           last_error = excluded.last_error, history = excluded.history,
           reason = excluded.reason, failed_at = excluded.failed_at`,
        [
          row.id,
          this.producer,
          row.seq,
          row.topic,
          json(row.payload),
          json(row.headers),
          row.key,
          row.created_at,
          update.attempts,
          update.error.error,
          json([...row.history, update.error]),
          update.reason,
          new Date(update.failedAt),
        ],
      );
      return true;
    });
  }

  async release(ids: readonly string[], owner: string): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    const released = await this.run(
      this.fork(),
      `update ${this.table('messages')} set lease_owner = null, lease_until = null
        where id = any(?::text[]) and producer = ? and lease_owner = ?
        returning id`,
      [pgArray(ids), this.producer, owner],
    );
    return released.length;
  }

  async stats(now: number): Promise<OutboxStoreStats> {
    const at = new Date(now);
    const [row] = await this.run<{
      pending: number;
      ready: number;
      leased: number;
      dead_letters: number;
      due_at: Date | null;
    }>(
      this.fork(),
      `select
         (select count(*)::int from ${this.table('messages')} where producer = ?) as pending,
         (select count(*)::int from ${this.table('messages')} m
           where ${this.claimable('m')}) as ready,
         (select count(*)::int from ${this.table('messages')}
           where producer = ? and lease_until > ?) as leased,
         (select count(*)::int from ${this.table('deadLetters')}
           where producer = ?) as dead_letters,
         (select min(case when attempts > 0 then created_at
                          when available_at <= ? then available_at end)
            from ${this.table('messages')} where producer = ?) as due_at`,
      [
        this.producer,
        ...this.claimableParams(at),
        this.producer,
        at,
        this.producer,
        at,
        this.producer,
      ],
    );
    return {
      pending: row.pending,
      ready: row.ready,
      leased: row.leased,
      deadLetters: row.dead_letters,
      oldestDueAt: row.due_at ? new Date(row.due_at).getTime() : null,
    };
  }

  async listDeadLetters({
    topic,
    key,
    limit = 50,
    offset = 0,
  }: OutboxDeadLetterQuery): Promise<OutboxDeadLetter[]> {
    const clauses = ['producer = ?'];
    const params: unknown[] = [this.producer];
    if (topic !== undefined) {
      clauses.push('topic = ?');
      params.push(topic);
    }
    if (key !== undefined) {
      clauses.push('key = ?');
      params.push(key);
    }
    const rows = await this.run<DeadLetterRow>(
      this.fork(),
      `select * from ${this.table('deadLetters')}
        where ${clauses.join(' and ')}
        order by failed_at desc, id desc
        limit ? offset ?`,
      [...params, limit, offset],
    );
    return rows.map(toDeadLetter);
  }

  async getDeadLetter(id: string): Promise<OutboxDeadLetter | undefined> {
    const [row] = await this.run<DeadLetterRow>(
      this.fork(),
      `select * from ${this.table('deadLetters')} where id = ? and producer = ?`,
      [id, this.producer],
    );
    return row ? toDeadLetter(row) : undefined;
  }

  requeueDeadLetters(
    filter: OutboxDeadLetterFilter,
    now: number,
  ): Promise<number> {
    const where = this.deadLetterFilter(filter);
    if (!where) {
      return Promise.resolve(0);
    }
    return this.transactional(async (em) => {
      const rows = await this.run<DeadLetterRow>(
        em,
        `select * from ${this.table('deadLetters')} where ${where.sql} for update`,
        where.params,
      );
      if (rows.length === 0) {
        return 0;
      }
      await this.run(
        em,
        `delete from ${this.table('deadLetters')} where id = any(?::text[])`,
        [pgArray(rows.map((row) => row.id))],
      );
      await this.run(
        em,
        `insert into ${this.table('messages')}
           (seq, id, producer, topic, payload, headers, key, created_at, available_at, attempts,
            last_error, history)
         values ${rows.map(() => '(?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, 0, ?, ?::jsonb)').join(', ')}`,
        rows.flatMap((row) => [
          row.seq,
          row.id,
          this.producer,
          row.topic,
          json(row.payload),
          json(row.headers),
          row.key,
          row.created_at,
          new Date(now),
          row.last_error,
          json(row.history),
        ]),
      );
      return rows.length;
    });
  }

  async purgeDeadLetters(filter: OutboxDeadLetterFilter): Promise<number> {
    const where = this.deadLetterFilter(filter);
    if (!where) {
      return 0;
    }
    return this.count(
      this.fork(),
      `delete from ${this.table('deadLetters')} where ${where.sql}`,
      where.params,
    );
  }

  async recordInbox(
    tx: EntityManager | undefined,
    consumer: string,
    messageId: string,
    now: number,
  ): Promise<boolean> {
    const em =
      tx === undefined ? this.fork() : MikroOrmOutboxStore.transactionOf(tx);
    const inserted = await this.run(
      em,
      `insert into ${this.table('inbox')} (consumer, message_id, processed_at)
       values (?, ?, ?)
       on conflict do nothing
       returning consumer`,
      [consumer, messageId, new Date(now)],
    );
    return inserted.length === 1;
  }

  async hasInbox(consumer: string, messageId: string): Promise<boolean> {
    const found = await this.run(
      this.fork(),
      `select 1 from ${this.table('inbox')} where consumer = ? and message_id = ?`,
      [consumer, messageId],
    );
    return found.length > 0;
  }

  pruneInbox(before: number): Promise<number> {
    return this.count(
      this.fork(),
      `delete from ${this.table('inbox')} where processed_at < ?`,
      [new Date(before)],
    );
  }

  /**
   * Notes what the message a consumer just recorded was and who produced it, through the same
   * transaction — see {@link OutboxInboxRecord}.
   */
  async describeInbox(
    tx: EntityManager,
    consumer: string,
    messageId: string,
    { messageType, origin }: { messageType?: string; origin?: string },
  ): Promise<void> {
    await this.run(
      MikroOrmOutboxStore.transactionOf(tx),
      `update ${this.table('inbox')} set message_type = ?, origin = ?
        where consumer = ? and message_id = ?`,
      [messageType ?? null, origin ?? null, consumer, messageId],
    );
  }

  /** What `consumer` has processed, newest first — for a spec, or an operator asking. */
  async processedBy(consumer: string): Promise<
    {
      messageId: string;
      messageType: string | null;
      origin: string | null;
      processedAt: Date;
    }[]
  > {
    const rows = await this.run<{
      message_id: string;
      message_type: string | null;
      origin: string | null;
      processed_at: Date;
    }>(
      this.fork(),
      `select message_id, message_type, origin, processed_at from ${this.table('inbox')}
        where consumer = ?
        order by processed_at desc, message_id`,
      [consumer],
    );
    return rows.map((row) => ({
      messageId: row.message_id,
      messageType: row.message_type,
      origin: row.origin,
      processedAt: new Date(row.processed_at),
    }));
  }

  /**
   * The handle `add()` and `recordInbox()` write through: the transaction's entity manager, however
   * it was handed over — the fork `transactional()` passes, or the global one whose context resolves
   * to it. Anything else would be the dual write the outbox exists to remove.
   */
  static transactionOf(tx: EntityManager): EntityManager {
    const em = tx instanceof EntityManager ? tx.getContext(false) : undefined;
    if (!em?.isInTransaction()) {
      throw new OutboxTransactionRequiredError(
        'Pass the EntityManager of an open transaction — the one em.transactional() hands its ' +
          'callback, or the one a unit of work runs in — and not the global EntityManager.',
      );
    }
    return em;
  }

  /**
   * Due, unleased, and no older message of its key is delayed or leased. The `not exists` probes
   * `(producer, key, seq)` from the key's oldest row.
   */
  private claimable(alias: string): string {
    return `${alias}.producer = ?
      and ${alias}.available_at <= ?
      and (${alias}.lease_until is null or ${alias}.lease_until <= ?)
      and (${alias}.key is null or not exists (
        select 1 from ${this.table('messages')} older
         where older.producer = ${alias}.producer
           and older.key = ${alias}.key
           and older.seq < ${alias}.seq
           and (older.available_at > ? or older.lease_until > ?)))`;
  }

  private claimableParams(at: Date): unknown[] {
    return [this.producer, at, at, at, at];
  }

  private deadLetterFilter({
    ids,
    topic,
    key,
    failedBefore,
    all,
  }: OutboxDeadLetterFilter): { sql: string; params: unknown[] } | undefined {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (ids) {
      if (ids.length === 0) {
        return undefined;
      }
      clauses.push('id = any(?::text[])');
      params.push(pgArray(ids));
    }
    if (topic !== undefined) {
      clauses.push('topic = ?');
      params.push(topic);
    }
    if (key !== undefined) {
      clauses.push('key = ?');
      params.push(key);
    }
    if (failedBefore !== undefined) {
      clauses.push('failed_at < ?');
      params.push(new Date(+failedBefore));
    }
    if (clauses.length === 0 && !all) {
      throw new Error(
        'Refusing an empty dead-letter filter; pass { all: true } to target every dead letter',
      );
    }
    return {
      sql: ['producer = ?', ...clauses].join(' and '),
      params: [this.producer, ...params],
    };
  }

  /** One lock per key, sorted, so two transactions locking the same keys cannot deadlock. */
  private keyLocks(messages: readonly OutboxMessage[]): number[] {
    const keys = new Set(
      messages.flatMap((message) =>
        message.key === null ? [] : [message.key],
      ),
    );
    return [
      ...new Set([...keys].map((key) => hash(`${this.producer}\u0000${key}`))),
    ].sort((a, b) => a - b);
  }

  private transactional<T>(
    work: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.fork().transactional((em) => work(em));
  }

  /** An entity manager of the store's own, outside whatever context the caller is in. */
  private fork(): EntityManager {
    return this.em.fork({ disableContextResolution: true });
  }

  private run<T = Record<string, unknown>>(
    em: EntityManager,
    sql: string,
    params: readonly unknown[],
  ): Promise<T[]> {
    return em
      .getConnection()
      .execute<T[]>(sql, [...params], 'all', em.getTransactionContext());
  }

  private async count(
    em: EntityManager,
    sql: string,
    params: readonly unknown[],
  ): Promise<number> {
    const [row] = await this.run<{ affected: number }>(
      em,
      `with affected as (${sql} returning 1) select count(*)::int as affected from affected`,
      params,
    );
    return row?.affected ?? 0;
  }

  private table(name: keyof Tables): string {
    this.tables ??= {
      messages: tableOf(this.em, OutboxMessageRecord),
      deadLetters: tableOf(this.em, OutboxDeadLetterRecord),
      inbox: tableOf(this.em, OutboxInboxRecord),
    };
    return this.tables[name];
  }
}

const tableOf = (em: EntityManager, entity: EntityName<object>): string => {
  const metadata = em.getMetadata().find(entity);
  if (!metadata) {
    throw new Error(
      `${String((entity as { name?: string }).name ?? entity)} is not mapped: add outboxEntities to ` +
        'the entities of the connection the outbox store writes through',
    );
  }
  const platform = em.getPlatform();
  const name = platform.quoteIdentifier(metadata.tableName);
  return metadata.schema
    ? `${platform.quoteIdentifier(metadata.schema)}.${name}`
    : name;
};

/** A key's lock, as the 32-bit integer the two-key form of an advisory lock takes. */
const hash = (value: string): number =>
  createHash('sha256').update(value).digest().readInt32BE(0);

const json = (value: unknown): string => JSON.stringify(value ?? null);

/**
 * A PostgreSQL array literal, every element quoted: the connection expands a JavaScript array into
 * a list of placeholders, so an array travels as the text `any(?::text[])` casts back.
 */
const pgArray = (values: readonly string[]): string =>
  `{${values.map((value) => `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`).join(',')}}`;

const toMessage = (row: MessageRow): OutboxMessage => ({
  id: row.id,
  topic: row.topic,
  payload: row.payload,
  headers: row.headers,
  key: row.key,
  createdAt: new Date(row.created_at).getTime(),
  availableAt: new Date(row.available_at).getTime(),
  attempts: row.attempts,
  lastError: row.last_error,
});

const toDeadLetter = (row: DeadLetterRow): OutboxDeadLetter => ({
  id: row.id,
  topic: row.topic,
  payload: row.payload,
  headers: row.headers,
  key: row.key,
  createdAt: new Date(row.created_at).getTime(),
  attempts: row.attempts,
  lastError: row.last_error,
  reason: row.reason,
  failedAt: new Date(row.failed_at).getTime(),
  history: row.history,
});
