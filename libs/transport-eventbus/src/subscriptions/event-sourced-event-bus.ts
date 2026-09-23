import { EntityManager } from '@mikro-orm/core';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventBus } from '@nestjs/cqrs';
import { inRequestContext } from '@nestposts/database';
import type { Observable } from 'rxjs';
import {
  concatMap,
  defer,
  from,
  interval,
  mergeMap,
  share,
  switchMap,
  tap,
} from 'rxjs';

import type { LoggedRecord } from '../persistence/event-log/event-log';
import { EventLog } from '../persistence/event-log/event-log';

/** How the log is read: how often, and how much at a time. */
export const EVENT_LOG_OPTIONS = Symbol('EventLogOptions');

/**
 * **The positions a read should have seen and did not** — Axon's `GapAwareTrackingToken`, in the
 * shape this reader can have one.
 *
 * `position` is a `bigserial`, so a row takes its number when it is INSERTed and becomes visible
 * when its transaction COMMITs, and those are not the same instant or even the same order. An append
 * joins the caller's transaction — `EventIngestion` writes the inbox row and the append together —
 * so the distance between the two is however long the rest of that unit of work takes.
 *
 * Measured, with two concurrent appends: the slower transaction took position 100 and stayed open,
 * the faster took 101 and committed, a read of `> 99` saw only 101 and the cursor moved there. When
 * 100 finally committed it was already behind the cursor, and **no read ever asked for it again**.
 * The subscriber simply never saw that event, with nothing logged and nothing failed.
 *
 * So a position missing from a read is not skipped, it is remembered and asked for again until
 * {@link EventLogOptions.gapTimeout} — which is what makes the cursor an order of arrival rather
 * than a high-water mark. `event-sourced-event-bus.spec.ts` holds the two transactions open by hand
 * and asserts both events arrive.
 */
const between = (
  cursor: string,
  highest: string,
  records: readonly LoggedRecord[],
  maxGapOffset: bigint,
): string[] => {
  const arrived = new Set(records.map((record) => record.position));
  const top = BigInt(highest);
  const missing: string[] = [];
  let at = BigInt(cursor) + 1n;
  if (top - at > maxGapOffset) {
    at = top - maxGapOffset;
  }
  for (; at < top; at += 1n) {
    if (!arrived.has(at.toString())) {
      missing.push(at.toString());
    }
  }
  return missing;
};

/** A gap a transaction rolled back is a number no row will ever carry, so it has to be let go. */
const expire = (gaps: Map<string, number>, timeout: number): void => {
  const deadline = Date.now() - timeout;
  for (const [position, seen] of gaps) {
    if (seen < deadline) {
      gaps.delete(position);
    }
  }
};

export interface EventLogOptions {
  /** Milliseconds between reads. */
  readonly interval?: number;
  /** How many rows one read may bring back. */
  readonly batch?: number;
  /**
   * How long a position missing from a read is worth asking for again, in milliseconds.
   *
   * It is a timeout and not a promise because a gap may never fill: `position` is a `bigserial`, and
   * a sequence hands out its value at INSERT and does not give it back on rollback. A gap left by a
   * transaction that rolled back is a number no row will ever carry, so something has to stop
   * looking for it.
   */
  readonly gapTimeout?: number;
  /**
   * How far below the highest position just read a gap is still worth remembering.
   *
   * Without it the sequence's own holes become work: `position` is global and never resets, so a
   * read that jumps — the first one after a purge, or a stretch of rolled back transactions — would
   * enumerate every number in between and ask for thousands of rows that were never written. A
   * transaction in flight is only ever a few positions behind the one that overtook it, so a short
   * window covers the case this exists for and nothing else.
   */
  readonly maxGapOffset?: number;
}

const DEFAULT_INTERVAL_MS = 200;

const DEFAULT_BATCH = 100;

const DEFAULT_GAP_TIMEOUT_MS = 30_000;

const DEFAULT_MAX_GAP_OFFSET = 1_000;

/**
 * **The `EventBus`, event sourced.**
 *
 * It is the same bus `@nestjs/cqrs` gives every application — the same token, the same `publish`, the
 * same `@EventsHandler`s — with its **observable side** reading a durable log instead of this
 * process's memory. Nothing new is asked of a caller: a subscription handler writes
 *
 * ```ts
 * subscribe(): Observable<PostCreatedEvent> {
 *   return this.eventBus.pipe(ofType(PostCreatedEvent));
 * }
 * ```
 *
 * and that is the whole contract, in one process or in twelve.
 *
 * ## Why this replaces a port instead of adding one
 * There used to be a `SubscriptionSource` — an interface, an implementation per source, an option on
 * `CqsrsModule`, and a rule that handlers must not name `EventBus`. It bought one thing: events from
 * other containers. The bus can carry that itself, so the port was a contract charging for something
 * the framework already had a place for.
 *
 * ## The three readers of a bus are not the same reader
 * `@nestjs/cqrs` reads this object in three different ways, and the difference is what makes this
 * work at all:
 *
 * | who | reads | gets |
 * |---|---|---|
 * | `@EventsHandler` | `subject$`, directly, in `bind()` | **this process** |
 * | a saga | the observable, at registration | **this process** (see {@link registerSagas}) |
 * | anything that pipes the bus — a `@SubscriptionHandler` | the observable | **the log** |
 *
 * That split is the design and not an accident. A projection must run **once** per event: published
 * onto every container's bus it would be written as many times as there are containers. A
 * subscription is the opposite — the container holding the stream open is usually not the one that
 * did the work, so it must see what the others did.
 */
@Injectable()
export class EventSourcedEventBus implements OnApplicationBootstrap {
  private readonly journal = new Logger(EventSourcedEventBus.name);
  private readonly interval: number;
  private readonly batch: number;
  private readonly gapTimeout: number;
  private readonly maxGapOffset: bigint;
  private log$?: Observable<object>;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly log: EventLog,
    private readonly em: EntityManager,
    @Optional() @Inject(EVENT_LOG_OPTIONS) logOptions?: EventLogOptions,
  ) {
    this.interval = logOptions?.interval ?? DEFAULT_INTERVAL_MS;
    this.batch = logOptions?.batch ?? DEFAULT_BATCH;
    this.gapTimeout = logOptions?.gapTimeout ?? DEFAULT_GAP_TIMEOUT_MS;
    this.maxGapOffset = BigInt(
      logOptions?.maxGapOffset ?? DEFAULT_MAX_GAP_OFFSET,
    );
  }

  /**
   * **It decorates the one `EventBus` there is; it does not replace it.**
   *
   * Binding the token to a subclass makes a **second** bus, and the symptom is a system that looks
   * fine: `CqrsModule` registers every `@EventsHandler` on the instance **it** resolves, while
   * anything outside that module — `EventIngestion`, here — injects the global override. The
   * ingestion then publishes into one bus while the projections listen to the other, and a post
   * completed by the other service is never projected. Measured on the deployed stack: the inbox
   * logged `inbox ← posts.PostCreated#2.0.0 from 'tagging'` and the read model stayed at version 1.
   *
   * ## Why the ordering is the mechanism, not a risk to be managed
   * This runs in `onApplicationBootstrap`, and `CqrsModule` — which `CqsrsModule` imports — is
   * bootstrapped **first**. By the time the source is repointed, `bind()` has already subscribed
   * every handler to `subject$` and `registerSagas` has already handed every saga an observable over
   * `subject$`. They keep what they hold. Only what pipes the bus **afterwards** — a
   * `@SubscriptionHandler`, resolved per client, long after boot — reads the log.
   */
  onApplicationBootstrap(): void {
    const bus = this.moduleRef.get(EventBus, { strict: false });
    bus.source = this.fromLog();
    this.journal.log(
      'the EventBus now reads the event log for anything that pipes it',
    );
  }

  private fromLog(): Observable<object> {
    this.log$ ??= defer(() => this.read()).pipe(
      share({ resetOnRefCountZero: true }),
    );
    return this.log$;
  }

  /**
   * A stream begins at the position the log is at **now**, so a subscriber gets what happens from the
   * moment it subscribed — which is what a subscription means. The cursor lives in memory and dies
   * with the process: a subscriber that went away is not owed what it missed.
   */
  private read(): Observable<object> {
    return defer(() => this.at(() => this.log.head())).pipe(
      switchMap((head) => {
        let cursor = head;
        const gaps = new Map<string, number>();
        this.journal.log(`reading the event log from position ${cursor}`);

        return interval(this.interval).pipe(
          concatMap(() =>
            this.at(() =>
              this.log.readAfter(cursor, this.batch, [...gaps.keys()]),
            ).catch((failure: unknown) => {
              /**
               * A read that fails must not end the stream. A subscriber is connected for as long as
               * it wants to be, and the reasons a query fails here are transient by nature — a
               * connection closed while the process was idle, a database restarting. The cursor does
               * not move, so the next tick asks for the same thing again.
               */
              this.journal.error(
                `could not read the event log past ${cursor}; retrying: ` +
                  `${(failure as Error)?.message ?? String(failure)}`,
              );
              return [] as LoggedRecord[];
            }),
          ),
          tap((records) => {
            expire(gaps, this.gapTimeout);
            if (records.length === 0) {
              return;
            }

            this.journal.debug(
              `log → ${records.length} event(s) past ${cursor}: ` +
                records
                  .map((record) => record.event.constructor.name)
                  .join(', '),
            );

            for (const record of records) {
              gaps.delete(record.position);
            }

            const highest = records[records.length - 1].position;
            for (const missing of between(
              cursor,
              highest,
              records,
              this.maxGapOffset,
            )) {
              if (!gaps.has(missing)) {
                gaps.set(missing, Date.now());
              }
            }
            if (BigInt(highest) > BigInt(cursor)) {
              cursor = highest;
            }
          }),
          mergeMap((records) => from(records.map((record) => record.event))),
        );
      }),
    );
  }

  /**
   * Nothing here originates in an HTTP request, so there is no MikroORM context to inherit — the
   * first query would be refused. `inRequestContext` opens one per read, which also keeps each tick's
   * identity map to itself.
   */
  private at<T>(work: () => Promise<T>): Promise<T> {
    return inRequestContext(this.em, work);
  }
}
