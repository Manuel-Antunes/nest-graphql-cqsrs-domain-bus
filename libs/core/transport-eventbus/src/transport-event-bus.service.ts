import type { OnModuleDestroy } from '@nestjs/common';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type {
  IEvent,
  IEventBus,
  IEventHandler,
  IEventPublisher,
} from '@nestjs/cqrs';
import { AsyncContext, EventBus } from '@nestjs/cqrs';
import { UnitOfWork } from '@nestposts/cqsrs';
import { lastValueFrom, merge } from 'rxjs';

import { isExcludedLocally } from './decorators/exclude-def.decorator';
import { EventForwarder } from './outbound/event-forwarder';
import { EventLog } from './persistence/event-log/event-log';

/**
 * **The integration point: an `IEventBus` that publishes locally and through the transports.**
 *
 * This is upstream's idea, and the reason this library is built on it rather than beside it. Nothing
 * that publishes has to know: a command handler, a saga, an aggregate's `commit()` — they all go
 * through the bus they already used, and the events that named a destination leave the process as
 * well.
 *
 * ## Why this, and not a subscription to the `EventBus`
 * Subscribing to the bus and forwarding whatever went by was the other option, and it is worse in
 * three ways that matter here:
 * - **it cannot be awaited.** `EventBus` hands an event to its subscribers and returns; a subscriber
 *   that publishes to a broker has nowhere to report failure, and no caller can wait for delivery.
 *   Being the bus means `publish` hands back the promise of the whole thing;
 * - **it cannot opt out.** `@ExcludeDef()` — an event that goes out and does *not* run locally — is
 *   not expressible from a subscriber, because by the time it sees the event the local handlers have
 *   already had it;
 * - **it doubles the request context.** The real bus attaches the `AsyncContext` to the event as part
 *   of publishing; a subscriber sees the result and has to guess.
 *
 * ## The request context crosses here
 * `publish(event, asyncContext)` attaches the context exactly as `EventBus` does, which is what makes
 * `AsyncContext.of(event)` answer downstream — and the serializer then writes what that context stands
 * for onto the envelope. Together with `AsyncContext.merge(request, command)` in a saga and
 * `mergeObjectContext(aggregate, request)` in a command handler, one request stays one request across
 * services.
 *
 * ## What it is *not*
 * A queue. If the transport is down, `publish` rejects; whoever called it decides.
 */
@Injectable()
export class TransportEventBusService implements IEventBus, OnModuleDestroy {
  private readonly logger = new Logger(TransportEventBusService.name);

  constructor(
    private readonly eventBus: EventBus,
    private readonly forwarder: EventForwarder,
    @Optional() private readonly log?: EventLog,
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
    });

    const unit = UnitOfWork.current();
    if (unit?.staging) {
      unit.on('prepareCommit', () => this.record(staged));
      unit.on('commit', () =>
        this.dispatch(staged, dispatcherContext, context),
      );
      return Promise.resolve();
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
   * **What publishing actually is**, once there is nothing left to decide: the event goes out and it
   * reaches this process. Called straight away when no unit of work is open — a message arriving on a
   * queue, a projection reacting — and at the unit's `commit` phase when one is.
   */
  private dispatch<TEvent extends IEvent>(
    events: TEvent[],
    dispatcherContext: unknown,
    context?: AsyncContext,
  ): Promise<void> {
    const outbound = events.map((event) =>
      this.forwarder.forward(event as object),
    );

    for (const event of events) {
      if (!isExcludedLocally(event as object)) {
        this.locally(event, dispatcherContext, context);
      }
    }

    return lastValueFrom(merge(...outbound), { defaultValue: undefined }).catch(
      (failure: Error) => {
        /*
         * The log IS the change, and it exists for a measured reason: a rejection here reaches whoever
         * called `publish`, and the one caller that cannot do anything with it is `aggregate.commit()`,
         * which nobody awaits. Without this line the only sign would be an unhandled rejection with no
         * event in it.
         */
        this.logger.error(
          `${events.map((event) => (event as object).constructor.name).join(', ')} was not ` +
            `published to the transport: ${failure.message}`,
          failure.stack,
        );
        throw failure;
      },
    );
  }

  /**
   * What this process publishes, written where every container can read it — which is what makes a
   * subscription on one container see what another decided. Appending an identifier the log already
   * has is a no-op, so an event that `EventIngestion` already appended inside its transaction costs
   * one statement here and nothing else.
   *
   * It runs at the unit of work's **prepare** phase, before anything is told: a failure here fails
   * the command, which is the point. An event nobody could record is not a fact.
   */
  private async record<TEvent extends IEvent>(events: TEvent[]): Promise<void> {
    if (!this.log || events.length === 0) {
      return;
    }
    await this.log.append(events as object[]);
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
