import type { OnApplicationBootstrap } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventBus } from '@nestjs/cqrs';
import { inRequestContext } from '@nestposts/database';
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

export interface EventLogOptions {
  /** Milliseconds between reads. */
  readonly interval?: number;
  /** How many rows one read may bring back. */
  readonly batch?: number;
}

const DEFAULT_INTERVAL_MS = 200;

const DEFAULT_BATCH = 100;

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
  private log$?: Observable<object>;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly log: EventLog,
    private readonly em: EntityManager,
    @Optional() @Inject(EVENT_LOG_OPTIONS) logOptions?: EventLogOptions,
  ) {
    this.interval = logOptions?.interval ?? DEFAULT_INTERVAL_MS;
    this.batch = logOptions?.batch ?? DEFAULT_BATCH;
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
        this.journal.log(`reading the event log from position ${cursor}`);

        return interval(this.interval).pipe(
          concatMap(() =>
            this.at(() => this.log.readAfter(cursor, this.batch)).catch(
              (failure: unknown) => {
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
              },
            ),
          ),
          tap((records) => {
            if (records.length > 0) {
              this.journal.debug(
                `log → ${records.length} event(s) past ${cursor}: ` +
                  records
                    .map((record) => record.event.constructor.name)
                    .join(', '),
              );
              cursor = records[records.length - 1].position;
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
