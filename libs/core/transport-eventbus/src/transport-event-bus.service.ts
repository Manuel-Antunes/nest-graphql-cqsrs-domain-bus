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

import { LocalEventDelivery } from './eventhandling/local-event-delivery';
import { EventStore } from './eventsourcing/event-store';
import { EventMessage } from './messaging/event-message';
import { MessageInterceptors } from './messaging/message-interceptors';
import { EventOutbox } from './outbox/event-outbox';
import { RequestContextCodec } from './request-context';
import { DefaultPhases } from './unit-of-work/phase';
import { ProcessingContext } from './unit-of-work/processing-context';
import { ResourceKey } from './unit-of-work/resource-key';
import { TransactionManager } from './unit-of-work/transaction-manager';
import { UnitOfWorkFactory } from './unit-of-work/unit-of-work-factory';

/** The events one unit of work staged, and whether its `PREPARE_COMMIT` still takes more. */
class StagedEvents {
  private readonly queue: EventMessage[] = [];
  closed = false;

  push(messages: readonly EventMessage[]): void {
    this.queue.push(...messages);
  }

  get pending(): boolean {
    return this.queue.length > 0;
  }

  take(): EventMessage[] {
    return this.queue.splice(0);
  }
}

/**
 * **The integration point: an `IEventBus` that is Axon 5's `EventSink`.**
 *
 * Nothing that publishes has to know: a command handler, a saga, an aggregate's `commit()` — they all
 * go through the bus they already used (`EventPublisher` is bound to this, see
 * `TRANSPORT_EVENT_BUS_PUBLISHER`), and what they publish becomes an {@link EventMessage}:
 * identified, typed, stamped with the request it was raised under and, by the dispatch interceptors,
 * with the correlation data of the message being handled and the trace it was published in.
 *
 * ## Staged in the unit of work, written and told in `PREPARE_COMMIT`
 * Inside a unit of work — every command, every ingested message, every streaming delivery — nothing
 * is published at once. The first publish of a unit registers **one** `PREPARE_COMMIT` action, and
 * it takes the staged events a batch at a time:
 *
 * ```
 * PREPARE_COMMIT, inside the unit's transaction
 *   ├ the event store appends the batch — on the unit's append condition, when it sourced anything
 *   ├ the outbox writes what the batch owes: a destination's message, a streaming group's
 *   └ the subscribing handlers are told, and the delivery waits for them and for what they dispatch
 *   … and again for whatever those handlers published, until nothing is left
 * COMMIT        the transaction commits
 * AFTER_COMMIT  the outbox's relay is woken; the subscriptions hear the events
 * ```
 *
 * That is Axon 5's `SimpleEventBus` — a per-context queue drained in `PREPARE_COMMIT`, events
 * published by subscribers during delivery drained in the same phase — with its event store's append
 * and the outbox as the durable steps of the same action. A handler that fails fails the unit (its
 * group's `ErrorHandler` decides), and a unit that fails publishes **nothing**: the staged events are
 * discarded with the rest of its transaction.
 *
 * A publish once the unit is past `PREPARE_COMMIT` throws, as it does in Axon: its events would be
 * told after the unit had already written what it publishes.
 *
 * ## Outside any unit of work
 * An `aggregate.commit()` nobody wrapped in a unit — a request that provisions a profile, a script —
 * is published in a unit of its **own**, on a detached transaction: nobody awaits it, and as part of
 * whatever transaction the caller is in it could outlive that transaction. When there is nothing to
 * write — no event store, nothing the outbox owes — it goes straight to the handlers, synchronously,
 * as Axon's `SimpleEventBus.publish(null, events)` does.
 */
@Injectable()
export class TransportEventBusService implements IEventBus, OnModuleDestroy {
  private static readonly STAGED = new ResourceKey<StagedEvents>(
    'StagedEvents',
  );
  private static readonly RELAY_WOKEN = new ResourceKey<boolean>('RelayWoken');
  private static readonly MAX_ROUNDS = 10;

  constructor(
    private readonly eventBus: EventBus,
    private readonly interceptors: MessageInterceptors,
    private readonly codec: RequestContextCodec,
    private readonly delivery: LocalEventDelivery,
    private readonly units: UnitOfWorkFactory,
    @Optional() private readonly store?: EventStore,
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
    const request =
      asyncContext ??
      (dispatcherOrAsyncContext instanceof AsyncContext
        ? dispatcherOrAsyncContext
        : undefined);
    const context = ProcessingContext.current();
    /**
     * **Copied, and that copy is load-bearing.** `AggregateRoot.commit()` hands `publishAll` its
     * INTERNAL array and then calls `uncommit()`, which empties it. A unit of work holds the events
     * until its `PREPARE_COMMIT`, and by then the array it was given has been cleared — the command
     * succeeds, appends nothing and tells nobody.
     */
    const messages = [...(events ?? [])].map((event) =>
      this.dispatched(event as object, request, context),
    );
    return this.stage(context, messages);
  }

  /**
   * **Messages already made** — an ingested event, a restored one — staged in `context`'s unit of
   * work, or published in a unit of their own when there is none. See the class note.
   */
  async stage(
    context: ProcessingContext | undefined,
    messages: readonly EventMessage[],
  ): Promise<void> {
    if (messages.length === 0) {
      return;
    }
    if (context) {
      this.stageIn(context, messages);
      return;
    }
    if (!this.store && !this.outbox?.concerns(messages)) {
      this.delivery.immediately(messages);
      return;
    }
    await this.units
      .detached()
      .create()
      .executeWithResult((opened) => this.stageIn(opened, messages));
  }

  /**
   * The message an event is published as: the one it already is, with what its request stands for
   * and whatever the dispatch interceptors add — correlation data first, and it wins, as in Axon.
   */
  private dispatched(
    event: object,
    request: AsyncContext | undefined,
    context: ProcessingContext | undefined,
  ): EventMessage {
    if (request && !AsyncContext.isAttached(event)) {
      request.attachTo(event);
    }
    const message = EventMessage.of(event).andMetadata(
      this.codec.toMetadata(AsyncContext.of(event)),
    );
    return this.interceptors.dispatch(message, context);
  }

  private stageIn(
    context: ProcessingContext,
    messages: readonly EventMessage[],
  ): void {
    const staged = context.getResource(TransportEventBusService.STAGED);
    if (staged && !staged.closed) {
      staged.push(messages);
      return;
    }
    if (staged || !context.accepts(DefaultPhases.PREPARE_COMMIT)) {
      throw new Error(
        `an event was published in ${context.phase?.name ?? 'a finished unit of work'}, after its unit of ` +
          `work had written what it publishes: ${messages.map((message) => message.type).join(', ')}. ` +
          'Publish from a handler, or from a unit of work of its own.',
      );
    }
    const queue = new StagedEvents();
    queue.push(messages);
    context.putResource(TransportEventBusService.STAGED, queue);
    context.onPrepareCommit((preparing) => this.prepare(preparing, queue));
  }

  private async prepare(
    context: ProcessingContext,
    queue: StagedEvents,
  ): Promise<void> {
    try {
      for (let round = 0; queue.pending; round += 1) {
        if (round >= TransportEventBusService.MAX_ROUNDS) {
          throw new Error(
            `a unit of work was still publishing after ${TransportEventBusService.MAX_ROUNDS} rounds of ` +
              'PREPARE_COMMIT: a handler publishes again every time it is told',
          );
        }
        const batch = queue.take();
        await this.store?.append(context, batch);
        if (await this.outbox?.stage(context, batch)) {
          this.wakeRelayAfterCommit(context);
        }
        await this.delivery.deliver(context, batch);
      }
    } finally {
      queue.closed = true;
    }
  }

  private wakeRelayAfterCommit(context: ProcessingContext): void {
    const outbox = this.outbox;
    if (
      !outbox ||
      context.putResourceIfAbsent(TransportEventBusService.RELAY_WOKEN, true)
    ) {
      return;
    }
    TransactionManager.afterCommit(context, () => outbox.committed());
  }
}
