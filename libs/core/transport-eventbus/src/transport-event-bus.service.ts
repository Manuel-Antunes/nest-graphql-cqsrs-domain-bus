import type { OnModuleDestroy } from '@nestjs/common';
import { Injectable, Optional } from '@nestjs/common';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type {
  IEvent,
  IEventBus,
  IEventHandler,
  IEventPublisher,
} from '@nestjs/cqrs';
import { AsyncContext, EventBus } from '@nestjs/cqrs';

import { EventOutbox } from './outbox/event-outbox';
import { EventLog } from './persistence/event-log/event-log';
import { EventTrace } from './tracing';
import { UnitOfWork } from './unit-of-work/unit-of-work';

/**
 * **The integration point: an `IEventBus` that publishes locally and through the outbox.**
 *
 * This is upstream's idea, and the reason this library is built on it rather than beside it. Nothing
 * that publishes has to know: a command handler, a saga, an aggregate's `commit()` — they all go
 * through the bus they already used, and the events whose namespace has a destination leave the
 * process as well.
 *
 * ## Why this, and not a subscription to the `EventBus`
 * Subscribing to the bus and forwarding whatever went by was the other option, and it is worse in
 * two ways that matter here:
 * - **it cannot be staged.** `EventBus` hands an event to its subscribers and returns; a subscriber
 *   has no unit of work to write the outbox in, and would record what the command had not committed;
 * - **it doubles the request context.** The real bus attaches the `AsyncContext` to the event as part
 *   of publishing; a subscriber sees the result and has to guess.
 *
 * ## The request context crosses here
 * `publish(event, asyncContext)` attaches the context exactly as `EventBus` does, which is what makes
 * `AsyncContext.of(event)` answer downstream — and {@link EventMessages} writes what that context
 * stands for into the message's headers. Together with `AsyncContext.merge(request, command)` in a
 * saga and `mergeObjectContext(aggregate, request)` in a command handler, one request stays one request
 * across services.
 *
 * ## Written down, never sent from here
 * What leaves is a message of `@nestjs/outbox`, written in the unit of work's own transaction
 * ({@link EventOutbox}) and published by the outbox's relay once that transaction has committed —
 * again and again until a broker takes it. This bus never talks to a broker: a service without an
 * outbox publishes to this process only.
 */
@Injectable()
export class TransportEventBusService implements IEventBus, OnModuleDestroy {
  /** The units whose commit already hands the outbox to the relay. */
  private readonly relayed = new WeakSet<UnitOfWork>();

  constructor(
    private readonly eventBus: EventBus,
    @Optional() private readonly log?: EventLog,
    @Optional() private readonly outbox?: EventOutbox,
  ) {}

  get publisher(): IEventPublisher {
    return this.eventBus.publisher;
  }

  onModuleDestroy(): void {
    this.eventBus.onModuleDestroy();
  }

  bind(handler: InstanceWrapper<IEventHandler<IEvent>>, id: string): void {
    this.eventBus.bind(handler, id);
  }

  registerSagas(types?: InstanceWrapper<object>[]): void {
    this.eventBus.registerSagas(types);
  }

  register(handlers?: InstanceWrapper<IEventHandler<IEvent>>[]): void {
    this.eventBus.register(handlers);
  }

  publish<TEvent extends IEvent>(
    event: TEvent,
    dispatcherOrAsyncContext?: unknown,
    asyncContext?: AsyncContext,
  ): Promise<void> {
    return this.publishAll([event], dispatcherOrAsyncContext, asyncContext);
  }

  publishAll<TEvent extends IEvent>(
    events: TEvent[],
    dispatcherOrAsyncContext?: unknown,
    asyncContext?: AsyncContext,
  ): Promise<void> {
    const [dispatcherContext, context] = normalize(
      dispatcherOrAsyncContext,
      asyncContext,
    );
    /**
     * **Copied, and that copy is load-bearing.** `AggregateRoot.commit()` hands `publishAll` its
     * INTERNAL array and then calls `uncommit()`, which empties it. Publishing straight away never
     * noticed; a unit of work holds the events until its commit phase, and by then the array it was
     * given has been cleared — the command succeeds, appends nothing and tells nobody.
     */
    const staged = [...(events ?? [])];
    staged.forEach((event) => {
      this.attach(event as object, context);
      EventTrace.stamp(event as object);
    });

    const unit = UnitOfWork.current();
    if (unit?.staging) {
      this.stageIn(unit, staged, dispatcherContext, context);
      return Promise.resolve();
    }

    /**
     * **With an outbox, an event that leaves is always published by a unit of work.** Its row has to
     * be written in a transaction, and the only honest one for a publish that no unit opened is its
     * own: recorded, committed, and only then told to this process — the same three steps a command
     * takes. Its OWN, and not a savepoint of whatever transaction the caller is in: nobody awaits an
     * `aggregate.commit()`, and a savepoint that outlived its transaction would fail to release. An
     * event that stays here keeps the synchronous path below.
     */
    if (this.outbox?.leaves(staged)) {
      const outbox = this.outbox;
      return UnitOfWork.run(
        async () => {
          const opened = UnitOfWork.current();
          if (opened) {
            this.stageIn(opened, staged, dispatcherContext, context);
          }
        },
        context,
        { transaction: outbox.detached },
      );
    }

    /**
     * No unit of work — a message arriving on a queue, a projection reacting, a spec. The phases
     * still happen, in the same order, one after the other: Axon's `AbstractEventBus` does exactly
     * this when `CurrentUnitOfWork` is not started, and the ordering is the part that matters. What
     * is recorded before it is told cannot be told without being recorded.
     *
     * A service with no log takes the branch above and publishes **synchronously**, exactly as it
     * always did. Going through a resolved promise instead would delay every local handler by a
     * microtask, which is invisible until a caller asserts right after an unawaited `commit()`.
     */
    if (!this.log) {
      return this.dispatch(staged, dispatcherContext, context);
    }
    return this.record(staged).then(() =>
      this.dispatch(staged, dispatcherContext, context),
    );
  }

  /**
   * The three moments of a staged publish, on the unit that staged it: recorded while the unit's
   * transaction is open, told to this process once it has committed, and — with an outbox — handed
   * to the relay after that, once per unit however many publishes it staged.
   */
  private stageIn<TEvent extends IEvent>(
    unit: UnitOfWork,
    staged: TEvent[],
    dispatcherContext: unknown,
    context?: AsyncContext,
  ): void {
    unit.on('prepareCommit', (prepared) =>
      this.record(staged, prepared.transactionHandle),
    );
    unit.on('commit', () => this.dispatch(staged, dispatcherContext, context));
    if (this.outbox && !this.relayed.has(unit)) {
      this.relayed.add(unit);
      const outbox = this.outbox;
      unit.on('afterCommit', () => outbox.committed());
    }
  }

  /**
   * **What publishing is, once the event is recorded**: the event reaches this process. Called
   * straight away when no unit of work is open — a message arriving on a queue, a projection
   * reacting — and at the unit's `commit` phase when one is: what leaves already left, as a message
   * of the outbox, in the prepare phase.
   */
  private dispatch<TEvent extends IEvent>(
    events: TEvent[],
    dispatcherContext: unknown,
    context?: AsyncContext,
  ): Promise<void> {
    for (const event of events) {
      this.locally(event, dispatcherContext, context);
    }
    return Promise.resolve();
  }

  /**
   * What this process publishes, written where every container can read it — which is what makes a
   * subscription on one container see what another decided — and, with an outbox, what it owes the
   * transports. Appending an identifier the log already has is a no-op, so the same instance
   * published twice is recorded once.
   *
   * It runs at the unit of work's **prepare** phase, inside its transaction and before anything is
   * told: a failure here fails the command, which is the point. An event nobody could record is not a
   * fact. `transaction` is that transaction's handle, which the outbox writes through.
   */
  private async record<TEvent extends IEvent>(
    events: TEvent[],
    transaction?: unknown,
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.log?.append(events as object[]);
    await this.outbox?.stage(events as object[], transaction);
  }

  private attach(event: object, context?: AsyncContext): void {
    if (context && !AsyncContext.isAttached(event)) {
      context.attachTo(event);
    }
  }

  private locally<TEvent extends IEvent>(
    event: TEvent,
    dispatcherContext: unknown,
    context?: AsyncContext,
  ): void {
    if (context) {
      this.eventBus.publish(event, dispatcherContext, context);
      return;
    }
    if (dispatcherContext !== undefined) {
      this.eventBus.publish(event, dispatcherContext);
      return;
    }
    this.eventBus.publish(event);
  }
}

/**
 * `IEventBus.publish` takes either a dispatcher context or an `AsyncContext` in the second position,
 * and `EventBus` sorts them out by type. Doing the same here is what lets this bus stand in for it.
 */
const normalize = (
  dispatcherOrAsyncContext: unknown,
  asyncContext: AsyncContext | undefined,
): [unknown, AsyncContext | undefined] =>
  !asyncContext && dispatcherOrAsyncContext instanceof AsyncContext
    ? [undefined, dispatcherOrAsyncContext]
    : [dispatcherOrAsyncContext, asyncContext];
