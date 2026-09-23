import type { Type } from '@nestjs/common';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import type { Observable } from 'rxjs';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AsyncContext } from '@nestjs/cqrs';
import { defer, filter, finalize, mergeMap, share, Subject } from 'rxjs';

import type { Subscription } from './classes/subscription';
import type {
  CqsrsModuleOptions,
  ISubscription,
  ISubscriptionBus,
  ISubscriptionHandler,
  ISubscriptionPublisher,
  SubscriptionMetadata,
} from './interfaces/index';
import { CQSRS_MODULE_OPTIONS } from './constants';
import {
  SUBSCRIPTION_HANDLER_METADATA,
  SUBSCRIPTION_METADATA,
} from './decorators/constants';
import {
  InvalidSubscriptionHandlerException,
  SubscriptionHandlerNotFoundException,
} from './exceptions/index';
import { DefaultSubscriptionPubSub } from './helpers/default-subscription-pubsub';
import { subscriptionKey } from './helpers/subscription-key';

export type SubscriptionHandlerType<
  SubscriptionBase extends ISubscription = ISubscription,
  TEvent = any,
> = Type<ISubscriptionHandler<SubscriptionBase, TEvent>>;

/** A handler already resolved from the container and ready to open a subscription's stream. */
type BoundSubscriptionHandler = (
  subscription: any,
  asyncContext?: AsyncContext,
) => Observable<any>;

/**
 * The subscription bus: **`subscribe` in place of `execute`**.
 *
 * Sibling to @nestjs/cqrs's `QueryBus`, with the same anatomy — a `Map` of handlers by message id, a
 * publisher, and itself an `ObservableBus` of whatever passed through it — and one difference of
 * nature: a query resolves a `Promise` and dies; a subscription returns an `Observable` that stays
 * open. Modelling that as a query worked by accident (`await`ing an `Observable`, which is not
 * *thenable*, returns the `Observable` itself); here it is the contract.
 *
 * ## What the bus does, so the handler does not have to
 * The handler only wires the message to the source (`eventBus.pipe(ofType(PostUpdatedEvent))`). The bus
 * does the rest, the same way for every subscription:
 *
 * 1. **finds the handler** by the id `@SubscriptionHandler` stored on the subscription class;
 * 2. **applies the message's own filter** (`subscription.match(event)`) over the stream — once per
 *    stream, not per subscriber;
 * 3. **shares by key** (see below);
 * 4. **shuts itself down**: when the last subscriber cancels, `share({ resetOnRefCountZero: true })`
 *    unsubscribes from the source. Nobody is left hanging on the `EventBus`.
 *
 * ## The filter is the key
 * A stream's key is `subscription id + serialized criteria` — {@link Subscription.key}. Two subscribers
 * asking for `onPostUpdated(postId: X)` are asking for *the same thing*: they get the same
 * `Observable`, and the `EventBus` sees a single subscriber, with the filter running once for both.
 * Asking for `postId: Y` is another key, another stream, another subscription.
 *
 * The stream `Map` is the one thing `QueryBus` does not have — and it is what the word "subscription"
 * demands: a query is stateless because nothing is left of it; an open stream is precisely what is
 * left. The map maintains itself: `finalize` removes the entry when the stream dies, and `defer` puts
 * it back if someone re-subscribes to that same `Observable` later. What is in the map is always what
 * is on the air.
 *
 * ## Why this bus is not an `ObservableBus`
 * `CommandBus`, `QueryBus` and `EventBus` *are* `Observable`s of the messages passing through them.
 * This one cannot be: `ObservableBus` extends `Observable`, and `Observable` already has a `subscribe`
 * method — which means something else ("notify me of the messages passing through this bus"). Two
 * different things do not fit in one name, and `subscribe(subscription)` is the method that gives the
 * bus its meaning. The `Subject` is still here, exposed as {@link SubscriptionBus.subscriptions$}:
 * whoever wants to observe who asked for what gets the same stream, under a name that does not lie.
 */
@Injectable()
export class SubscriptionBus<
  SubscriptionBase extends ISubscription = ISubscription,
> implements ISubscriptionBus<SubscriptionBase> {
  private readonly logger = new Logger(SubscriptionBus.name);
  private readonly subject$ = new Subject<SubscriptionBase>();
  /** subscription id → resolved handler. */
  private readonly handlers = new Map<string, BoundSubscriptionHandler>();
  /** key (id + criteria) → the shared stream currently on the air for it. */
  private readonly streams = new Map<string, Observable<any>>();
  private _publisher: ISubscriptionPublisher<SubscriptionBase>;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional()
    @Inject(CQSRS_MODULE_OPTIONS)
    private readonly options?: CqsrsModuleOptions,
  ) {
    if (this.options?.subscriptionPublisher) {
      this._publisher = this.options
        .subscriptionPublisher as ISubscriptionPublisher<SubscriptionBase>;
    } else {
      this.useDefaultPublisher();
    }
  }

  /**
   * Every subscription requested from this bus, in the order it was requested — what the `QueryBus`
   * delivers by being an `Observable` itself. Useful for instrumentation: who subscribed to what, how
   * many times.
   */
  get subscriptions$(): Observable<SubscriptionBase> {
    return this.subject$.asObservable();
  }

  /** The publisher every requested subscription is announced to. */
  get publisher(): ISubscriptionPublisher<SubscriptionBase> {
    return this._publisher;
  }

  /**
   * Swaps the publisher. The default is `DefaultSubscriptionPubSub` (in memory).
   * @param _publisher The publisher.
   */
  set publisher(_publisher: ISubscriptionPublisher<SubscriptionBase>) {
    this._publisher = _publisher;
  }

  /**
   * Opens (or reuses) a subscription's stream.
   * @param subscription The subscription, carrying the requester's criteria.
   */
  subscribe<TEvent>(
    subscription: Subscription<TEvent, any>,
  ): Observable<TEvent>;
  /**
   * Opens (or reuses) a subscription's stream.
   * @param subscription The subscription, carrying the requester's criteria.
   */
  subscribe<T extends SubscriptionBase, TEvent = any>(
    subscription: T,
  ): Observable<TEvent>;
  /**
   * Opens (or reuses) a subscription's stream.
   * @param subscription The subscription, carrying the requester's criteria.
   * @param asyncContext A request-scoped handler's context.
   */
  subscribe<TEvent>(
    subscription: Subscription<TEvent, any>,
    asyncContext: AsyncContext,
  ): Observable<TEvent>;
  /**
   * Opens (or reuses) a subscription's stream.
   * @param subscription The subscription, carrying the requester's criteria.
   * @param asyncContext A request-scoped handler's context.
   */
  subscribe<T extends SubscriptionBase, TEvent = any>(
    subscription: T,
    asyncContext: AsyncContext,
  ): Observable<TEvent>;
  subscribe<TEvent>(
    subscription: Subscription<TEvent, any>,
    asyncContext?: AsyncContext,
  ): Observable<TEvent> {
    const subscriptionId = this.getSubscriptionId(subscription);
    const handler = this.handlers.get(subscriptionId);
    if (!handler) {
      throw new SubscriptionHandlerNotFoundException(
        this.getSubscriptionName(subscription),
      );
    }
    this._publisher.publish(subscription as unknown as SubscriptionBase);

    const key = `${subscriptionId}:${this.getStreamKey(subscription)}`;
    const alreadyOpen = this.streams.get(key) as Observable<TEvent> | undefined;
    if (alreadyOpen) {
      return alreadyOpen;
    }

    /**
     * `defer` because the source should only be touched once somebody actually subscribes — and again,
     * from scratch, if the stream was shut down for lack of subscribers and someone re-subscribes to
     * *this same* `Observable`. It is in that second case that the map entry has to come back.
     */
    const stream: Observable<TEvent> = defer(() => {
      this.streams.set(key, stream);
      return handler(subscription, asyncContext) as Observable<TEvent>;
    }).pipe(
      filter((event) => subscription.match?.(event) ?? true),
      finalize(() => {
        if (this.streams.get(key) === stream) {
          this.streams.delete(key);
        }
      }),
      share({ resetOnRefCountZero: true }),
    );
    this.streams.set(key, stream);
    return stream;
  }

  /**
   * Binds a handler to a subscription id. Same fork as `QueryBus.bind`: with a static dependency tree
   * the instance is unique and resolved at bootstrap; otherwise it is resolved on each subscribe,
   * inside the `defer`, in that request's context.
   */
  bind<T extends SubscriptionBase, TEvent = any>(
    handler: InstanceWrapper<ISubscriptionHandler<T, TEvent>>,
    subscriptionId: string,
  ): void {
    if (handler.isDependencyTreeStatic()) {
      const instance = handler.instance as {
        subscribe?: (subscription: T) => Observable<TEvent>;
      };
      if (!instance?.subscribe) {
        throw new InvalidSubscriptionHandlerException();
      }
      this.handlers.set(subscriptionId, (subscription) =>
        instance.subscribe!(subscription as T),
      );
      return;
    }
    this.handlers.set(subscriptionId, (subscription, context) =>
      defer(() => {
        const asyncContext =
          context ??
          AsyncContext.of(subscription as object) ??
          new AsyncContext();
        this.moduleRef.registerRequestByContextId(
          asyncContext,
          asyncContext.id,
        );
        return this.moduleRef.resolve<{
          subscribe: (subscription: T) => Observable<TEvent>;
        }>(handler.metatype as Type, asyncContext.id, { strict: false });
      }).pipe(mergeMap((instance) => instance.subscribe(subscription as T))),
    );
  }

  register(handlers: InstanceWrapper<ISubscriptionHandler<any>>[] = []): void {
    handlers.forEach((handler) => this.registerHandler(handler));
  }

  protected registerHandler(
    handler: InstanceWrapper<ISubscriptionHandler<any>>,
  ): void {
    const typeRef = (
      handler.inject ? handler.instance?.constructor : handler.metatype
    ) as Type;
    const target = this.reflectSubscriptionId(typeRef);
    if (!target) {
      throw new InvalidSubscriptionHandlerException();
    }
    if (this.handlers.has(target)) {
      this.logger.warn(
        `Subscription handler [${typeRef.name}] is already registered. Overriding previously registered handler.`,
      );
    }
    this.bind(
      handler as InstanceWrapper<ISubscriptionHandler<SubscriptionBase>>,
      target,
    );
  }

  /** The id `@SubscriptionHandler` stored on the subscription class. */
  private getSubscriptionId(subscription: ISubscription): string {
    const { constructor: subscriptionType } =
      Object.getPrototypeOf(subscription);
    const metadata: SubscriptionMetadata | undefined = Reflect.getMetadata(
      SUBSCRIPTION_METADATA,
      subscriptionType,
    );
    if (!metadata) {
      throw new SubscriptionHandlerNotFoundException(subscriptionType.name);
    }
    return metadata.id;
  }

  private reflectSubscriptionId(handler: Type): string | undefined {
    const subscription = Reflect.getMetadata(
      SUBSCRIPTION_HANDLER_METADATA,
      handler,
    );
    const metadata: SubscriptionMetadata | undefined =
      subscription && Reflect.getMetadata(SUBSCRIPTION_METADATA, subscription);
    return metadata?.id;
  }

  /**
   * The part of the key that comes from the criteria. A `Subscription` already knows its own
   * ({@link Subscription.key}); a message that merely implements `ISubscription` falls back to the
   * serialized criteria — and, with no criteria at all, every instance of it shares a single stream.
   */
  private getStreamKey(subscription: Subscription<unknown, any>): string {
    return (
      subscription.key ??
      subscriptionKey((subscription as { criteria?: unknown }).criteria)
    );
  }

  private getSubscriptionName(subscription: ISubscription): string {
    const { constructor } = Object.getPrototypeOf(subscription);
    return constructor.name;
  }

  private useDefaultPublisher(): void {
    this._publisher = new DefaultSubscriptionPubSub<SubscriptionBase>(
      this.subject$,
    );
  }
}
