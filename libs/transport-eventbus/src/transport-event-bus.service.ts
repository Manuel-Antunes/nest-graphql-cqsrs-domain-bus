import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import {
  AsyncContext,
  EventBus,
  type IEvent,
  type IEventBus,
  type IEventHandler,
  type IEventPublisher,
} from '@nestjs/cqrs';
import { lastValueFrom, merge } from 'rxjs';
import { isExcludedLocally } from './decorators/exclude-def.decorator';
import { EventForwarder } from './outbound/event-forwarder';

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
    const [dispatcherContext, context] = normalize(dispatcherOrAsyncContext, asyncContext);
    const outbound = (events ?? []).map((event) => {
      this.attach(event as object, context);
      return this.forwarder.forward(event as object);
    });

    for (const event of events ?? []) {
      if (!isExcludedLocally(event as object)) {
        this.locally(event, dispatcherContext, context);
      }
    }

    return lastValueFrom(merge(...outbound), { defaultValue: undefined }).catch((failure: Error) => {
      /*
       * The log IS the change, and it exists for a measured reason: a rejection here reaches whoever
       * called `publish`, and the one caller that cannot do anything with it is `aggregate.commit()`,
       * which nobody awaits. Without this line the only sign would be an unhandled rejection with no
       * event in it.
       */
      this.logger.error(
        `${(events ?? []).map((event) => (event as object).constructor.name).join(', ')} was not ` +
          `published to the transport: ${failure.message}`,
        failure.stack,
      );
      throw failure;
    });
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
