import type { EntityName } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext, TENANT_HEADER, Tenant } from '@nestposts/database';

import { StoredEventEntitySchema } from './event-store.entities';

/** One event as the store keeps it — `@nestposts/transport-eventbus`'s `StoredEvent`, by shape. */
export interface EventRecord {
  readonly identifier: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly metadata: Readonly<Record<string, string>>;
  readonly timestamp: Date;
  readonly tags: readonly string[];
}

/** A record and its place in the global order. */
export interface PositionedEventRecord extends EventRecord {
  readonly position: string;
}

/** Every one of these tags, and one of these qualified names when any are given. */
export interface EventRecordCriterion {
  readonly tags: readonly string[];
  readonly types: readonly string[];
}

/** No record matching `criteria` (none means every record) after position `after`. */
export interface EventRecordCondition {
  readonly after: string;
  readonly criteria: readonly EventRecordCriterion[];
}

export type EventRecordAppendOutcome =
  | { readonly rejected: false; readonly last?: string }
  | { readonly rejected: true; readonly conflict?: string };

interface Row {
  position: string;
  identifier: string;
  messageType: string;
  payload: string;
  metadata: Record<string, string> | null;
  occurredAt: Date;
  tags: string[] | null;
  tenant: string | null;
}

const COLUMNS = `position, identifier, message_type as "messageType", payload, metadata,
  occurred_at as "occurredAt", tags, tenant`;

/**
 * **The event store, on MikroORM and PostgreSQL** — `@nestposts/transport-eventbus`'s
 * `EventStorageEngine`, which it satisfies by its shape without importing it: this library is a
 * table and the SQL over it, and knows nothing of the bus that appends to it.
 *
 * ```ts
 * imports: [MikroOrmEventStoreModule],
 * TransportEventBusModule.forRoot({ …, eventStore: { engine: MikroOrmEventStorageEngine, entities: [...] } })
 * ```
 *
 * ## How a condition holds under concurrency
 * A condition is checked by a statement — "is there an event matching the criteria after the marker?"
 * — and a statement only sees what committed. Two units deciding on the same tags would each check
 * before the other committed, each find nothing, and both append. So every append first takes a
 * transaction-level advisory lock per tag it involves — the tags of its criteria and the tags of its
 * events — sorted, so two appends cannot deadlock on one batch. Whoever holds a tag's lock commits
 * before the next can check, and the check then sees it. A criteria that names no tag — "every event
 * of this type", "every event" — cannot be locked by tag, so it takes one lock over the whole store
 * exclusively, and every append takes that same lock shared.
 *
 * A marker is the position of the last event a read saw among those its criteria matched: an event
 * appended to those tags later has to wait for the lock, and gets a later position.
 *
 * Every statement is native, for the reason the outbox's are: `on conflict do nothing` and array
 * containment are not something an ORM expresses. A native statement is not resolved against the
 * connection's schema either, so the table is read off the metadata.
 */
@Injectable()
export class MikroOrmEventStorageEngine {
  private static readonly WHOLE_STORE = 'event_log:*';

  private table?: string;

  constructor(private readonly em: EntityManager) {}

  async appendEvents(
    events: readonly EventRecord[],
    condition: EventRecordCondition | undefined,
    transaction?: EntityManager,
  ): Promise<EventRecordAppendOutcome> {
    if (events.length === 0) {
      return { rejected: false };
    }
    return this.within(transaction, async (em) => {
      await this.lock(em, events, condition);
      if (condition) {
        const conflict = await this.firstConflict(em, condition);
        if (conflict) {
          return { rejected: true, conflict };
        }
      }
      let last: string | undefined;
      const tenant = Tenant.ofSchema(em.schema) ?? null;
      for (const event of events) {
        const [appended] = await this.run<{ position: string }>(
          em,
          `insert into ${this.tableOf(em)}
                  (identifier, message_type, payload, metadata, occurred_at, tags, tenant)
           values (?, ?, ?, ?::jsonb, ?, ?::text[], ?)
           on conflict (identifier) do nothing
           returning position::text as position`,
          [
            event.identifier,
            event.type,
            JSON.stringify(event.payload),
            JSON.stringify(event.metadata),
            event.timestamp,
            pgArray(event.tags),
            tenant,
          ],
        );
        last = appended?.position ?? last;
      }
      return { rejected: false, last };
    });
  }

  source(
    criteria: readonly EventRecordCriterion[],
    transaction?: EntityManager,
  ): Promise<PositionedEventRecord[]> {
    return this.reading(transaction, async (em) => {
      const [where, params] = this.criteriaSql(criteria);
      const rows = await this.run<Row>(
        em,
        `select ${COLUMNS} from ${this.tableOf(em)} where ${where} order by position asc`,
        params,
      );
      return rows.map((row) => recordOf(row));
    });
  }

  readAfter(
    position: string,
    limit: number,
    gaps: readonly string[] = [],
  ): Promise<PositionedEventRecord[]> {
    return this.reading(undefined, async (em) => {
      const rows = await this.run<Row>(
        em,
        `select ${COLUMNS} from ${this.tableOf(em)}
          where position > ? or position = any(?::bigint[])
          order by position asc
          limit ?`,
        [position, `{${gaps.join(',')}}`, limit],
      );
      return rows.map((row) => recordOf(row));
    });
  }

  head(): Promise<string> {
    return this.reading(undefined, async (em) => {
      const [row] = await this.run<{ head: string | null }>(
        em,
        `select coalesce(max(position), 0)::text as head from ${this.tableOf(em)}`,
        [],
      );
      return row?.head ?? '0';
    });
  }

  /**
   * The first position that breaks the condition — an event matching its criteria after its marker —
   * or `undefined` when it holds.
   */
  private async firstConflict(
    em: EntityManager,
    condition: EventRecordCondition,
  ): Promise<string | undefined> {
    const [where, params] = this.criteriaSql(condition.criteria);
    const [row] = await this.run<{ position: string }>(
      em,
      `select position::text as position from ${this.tableOf(em)}
        where position > ? and (${where})
        order by position asc limit 1`,
      [condition.after, ...params],
    );
    return row?.position;
  }

  private async lock(
    em: EntityManager,
    events: readonly EventRecord[],
    condition: EventRecordCondition | undefined,
  ): Promise<void> {
    const wholeStore =
      condition !== undefined &&
      (condition.criteria.length === 0 ||
        condition.criteria.some((criterion) => criterion.tags.length === 0));
    await this.run(
      em,
      wholeStore
        ? 'select pg_advisory_xact_lock(hashtextextended(?, 0))'
        : 'select pg_advisory_xact_lock_shared(hashtextextended(?, 0))',
      [MikroOrmEventStorageEngine.WHOLE_STORE],
    );
    const tags = new Set([
      ...events.flatMap((event) => event.tags),
      ...(condition?.criteria.flatMap((criterion) => criterion.tags) ?? []),
    ]);
    for (const tag of [...tags].sort()) {
      await this.run(
        em,
        'select pg_advisory_xact_lock(hashtextextended(?, 0))',
        [`event_log:${tag}`],
      );
    }
  }

  /** `where` for a criteria: any criterion, each with all of its tags and one of its types. */
  private criteriaSql(
    criteria: readonly EventRecordCriterion[],
  ): [string, unknown[]] {
    if (criteria.length === 0) {
      return ['true', []];
    }
    const clauses: string[] = [];
    const params: unknown[] = [];
    for (const criterion of criteria) {
      const parts: string[] = [];
      if (criterion.tags.length > 0) {
        parts.push('tags @> ?::text[]');
        params.push(pgArray(criterion.tags));
      }
      if (criterion.types.length > 0) {
        parts.push(`split_part(message_type, '#', 1) = any(?::text[])`);
        params.push(pgArray(criterion.types));
      }
      clauses.push(parts.length > 0 ? `(${parts.join(' and ')})` : 'true');
    }
    return [clauses.join(' or '), params];
  }

  /** Through the unit's transaction when there is one; in a transaction of its own otherwise. */
  private within<T>(
    transaction: EntityManager | undefined,
    work: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    return transaction
      ? work(transaction)
      : inRequestContext(this.em, () =>
          this.em.getContext().transactional((em) => work(em)),
        );
  }

  private reading<T>(
    transaction: EntityManager | undefined,
    work: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    return transaction
      ? work(transaction)
      : inRequestContext(this.em, () => work(this.em.getContext()));
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

  private tableOf(em: EntityManager): string {
    this.table ??= tableOf(
      em,
      StoredEventEntitySchema as unknown as EntityName<object>,
    );
    return this.table;
  }
}

const recordOf = (row: Row): PositionedEventRecord => {
  const metadata = { ...(row.metadata ?? {}) };
  if (row.tenant && !metadata[TENANT_HEADER]) {
    metadata[TENANT_HEADER] = row.tenant;
  }
  return {
    position: row.position,
    identifier: row.identifier,
    type: row.messageType,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    metadata,
    timestamp: new Date(row.occurredAt),
    tags: row.tags ?? [],
  };
};

const tableOf = (em: EntityManager, entity: EntityName<object>): string => {
  const metadata = em.getMetadata().find(entity);
  if (!metadata) {
    throw new Error(
      'StoredEvent is not mapped: import MikroOrmEventStoreModule, or add eventStoreEntities to ' +
        'the entities of the connection the event store writes through',
    );
  }
  const platform = em.getPlatform();
  const name = platform.quoteIdentifier(metadata.tableName);
  return metadata.schema
    ? `${platform.quoteIdentifier(metadata.schema)}.${name}`
    : name;
};

/**
 * A PostgreSQL array literal, every element quoted: the connection expands a JavaScript array into
 * a list of placeholders, so an array travels as the text `?::text[]` casts back.
 */
const pgArray = (values: readonly string[]): string =>
  `{${values.map((value) => `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`).join(',')}}`;
