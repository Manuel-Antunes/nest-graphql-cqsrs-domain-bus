import { Injectable } from '@nestjs/common';

import { instantiate } from '../inbound/event-reconstruction';
import { EventMessage } from '../messaging/event-message';
import { MessageType } from '../messaging/message-type';
import { decodeData, encodeData } from '../outbound/message-headers';
import { markIngested } from '../outbound/transport-metadata';
import type { ProcessingContext } from '../unit-of-work/processing-context';
import { ResourceKey } from '../unit-of-work/resource-key';
import { TransactionManager } from '../unit-of-work/transaction-manager';
import {
  AppendCondition,
  AppendEventsTransactionRejectedError,
  ConsistencyMarker,
} from './append-condition';
import type { EventCriteria } from './event-criteria';
import type {
  PositionedEvent,
  StoredCriterion,
  StoredEvent,
} from './event-storage-engine';
import { EventStorageEngine } from './event-storage-engine';
import { TagResolver } from './tag';

/** One event read back in the store's global order. */
export interface StoredRecord {
  readonly position: string;
  readonly message: EventMessage;
}

/**
 * **The event store's side of one unit of work** — Axon 5's `EventStoreTransaction`, kept as a
 * resource of the unit's context.
 *
 * Every {@link source} widens the unit's criteria and keeps the earliest marker it read up to; the
 * {@link append} that the bus makes in `PREPARE_COMMIT` carries that as its condition, so it is refused
 * if an event any of those reads would have matched was appended in the meantime. A unit that read
 * nothing appends unconditionally. Its own appends move the marker forward, so a unit that appends
 * twice — a handler publishing while the first batch is delivered — is not refused by itself.
 */
export class EventStoreTransaction {
  private criteria?: EventCriteria;
  private marker?: ConsistencyMarker;

  constructor(
    private readonly store: EventStore,
    private readonly context: ProcessingContext,
  ) {}

  async source(criteria: EventCriteria): Promise<EventMessage[]> {
    const rows = await this.store.engine.source(
      EventStore.criteriaOf(criteria),
      TransactionManager.handleOf(this.context),
    );
    const seen = rows.length
      ? ConsistencyMarker.at(rows[rows.length - 1].position)
      : ConsistencyMarker.ORIGIN;
    this.criteria = this.criteria ? this.criteria.or(criteria) : criteria;
    this.marker = this.marker ? this.marker.lowerBound(seen) : seen;
    return rows.map((row) => EventStore.messageOf(row));
  }

  /** The condition the next append carries: none, until something was read. */
  get appendCondition(): AppendCondition {
    return this.criteria
      ? new AppendCondition(
          this.marker ?? ConsistencyMarker.ORIGIN,
          this.criteria,
        )
      : AppendCondition.none();
  }

  async append(messages: readonly EventMessage[]): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    const condition = this.appendCondition;
    const outcome = await this.store.engine.appendEvents(
      messages.map((message) => this.store.storedOf(message)),
      condition.isNone
        ? undefined
        : {
            after: condition.marker.position ?? '0',
            criteria: EventStore.criteriaOf(condition.criteria),
          },
      TransactionManager.handleOf(this.context),
    );
    if (outcome.rejected) {
      throw new AppendEventsTransactionRejectedError(
        condition,
        outcome.conflict
          ? `the first conflicting event is at ${outcome.conflict}`
          : undefined,
      );
    }
    this.advance(outcome.last);
  }

  private advance(last: string | undefined): void {
    if (last && this.marker) {
      this.marker = this.marker.upperBound(ConsistencyMarker.at(last));
    }
  }
}

/**
 * **The events this service knows, in one order, and the consistency of what it decides on them** —
 * Axon 5's `EventStore`, on the application's {@link EventStorageEngine}.
 *
 * | | |
 * |---|---|
 * | {@link transaction} | the unit's reads and appends, and the condition they add up to |
 * | {@link append} | what the bus calls in `PREPARE_COMMIT`, for every event a unit published or ingested |
 * | {@link readAfter}, {@link head} | the global order, for `EventSourcedEventBus`'s subscribers |
 *
 * Every event is filed under the tags its {@link TagResolver} gives it, and read back as a message
 * whose payload is an instance of its real class, marked as coming from the store.
 */
@Injectable()
export class EventStore {
  private static readonly TRANSACTION = new ResourceKey<EventStoreTransaction>(
    'EventStoreTransaction',
  );

  constructor(
    readonly engine: EventStorageEngine,
    private readonly tags: TagResolver,
  ) {}

  /** The unit's transaction — one per unit, however many branches ask. */
  transaction(context: ProcessingContext): EventStoreTransaction {
    return context.computeResourceIfAbsent(
      EventStore.TRANSACTION,
      () => new EventStoreTransaction(this, context),
    );
  }

  /** In the unit's transaction when there is a unit; on its own otherwise, unconditionally. */
  async append(
    context: ProcessingContext | undefined,
    messages: readonly EventMessage[],
  ): Promise<void> {
    if (context) {
      await this.transaction(context).append(messages);
      return;
    }
    await this.engine.appendEvents(
      messages.map((message) => this.storedOf(message)),
      undefined,
    );
  }

  /** Every event matching `criteria`, in order — recorded as the unit's condition when there is a unit. */
  source(
    criteria: EventCriteria,
    context?: ProcessingContext,
  ): Promise<EventMessage[]> {
    return context
      ? this.transaction(context).source(criteria)
      : this.engine
          .source(EventStore.criteriaOf(criteria))
          .then((rows) => rows.map((row) => EventStore.messageOf(row)));
  }

  async readAfter(
    position: string,
    limit: number,
    gaps: readonly string[] = [],
  ): Promise<StoredRecord[]> {
    const rows = await this.engine.readAfter(position, limit, gaps);
    return rows.map((row) => ({
      position: row.position,
      message: EventStore.messageOf(row),
    }));
  }

  head(): Promise<string> {
    return this.engine.head();
  }

  storedOf(message: EventMessage): StoredEvent {
    return {
      identifier: message.identifier,
      type: message.type.toString(),
      payload: encodeData(message.payload),
      metadata: message.metadata,
      timestamp: message.timestamp,
      tags: this.tags.resolve(message).map((tag) => tag.toString()),
    };
  }

  static messageOf(row: PositionedEvent): EventMessage {
    const payload = instantiate(row.type, decodeData(row.payload));
    markIngested(payload);
    return EventMessage.create(payload, {
      identifier: row.identifier,
      type: MessageType.parse(row.type),
      metadata: row.metadata,
      timestamp: new Date(row.timestamp),
    });
  }

  static criteriaOf(criteria: EventCriteria): StoredCriterion[] {
    return criteria.criteria.map((criterion) => ({
      tags: criterion.tags.map((tag) => tag.toString()),
      types: [...criterion.types],
    }));
  }
}
