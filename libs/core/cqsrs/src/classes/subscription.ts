import { subscriptionKey } from '../helpers/subscription-key';
import { EVENT_TYPE_SYMBOL } from './constants';

/** The type of event a subscription delivers. */
export type SubscriptionEvent<S> =
  S extends Subscription<infer TEvent, any> ? TEvent : never;

/**
 * The type of a subscription's filter criteria — what the interface layer has to assemble in order to
 * request it. `SubscriptionCriteria<OnPostUpdatedSubscription>` is `{ postId?: string | null }`.
 */
export type SubscriptionCriteria<S> =
  S extends Subscription<any, infer TCriteria> ? TCriteria : never;

/**
 * A subscription message: "notify me on every event of this kind that matches these criteria".
 *
 * It is the third CQSRS message, sibling to @nestjs/cqrs's `Command<T>` and `Query<T>` — and the
 * difference between it and a query is what justifies a bus of its own: a query is *one* answer and
 * it is over (`Promise<T>`); a subscription is a stream that stays open (`Observable<TEvent>`) until
 * the subscriber leaves. `execute` does not describe that; `subscribe` does.
 *
 * ## The filter lives here, not in the interface layer
 * A subscription has two halves, and both are application rules:
 *
 * - **the criteria** (`criteria`), the *data*: which events are of interest. Whoever requests the
 *   subscription fills it in — normally the interface layer, from the protocol's arguments (GraphQL's
 *   `@Args`);
 * - **the filter** (`match`), the *rule*: what those criteria mean when faced with an event. The
 *   application writes it, here, next to the message.
 *
 * The interface says *what*, the application decides *how* — neither knows about the other. And
 * because `match` is a method on the message itself, the `SubscriptionBus` applies the filter to the
 * stream while knowing nothing about the domain: it just calls `subscription.match(event)`.
 *
 * ## The criteria are also the key
 * `key` is the criteria serialized stably ({@link subscriptionKey}). It is what the bus uses to find a
 * stream already on the air: two subscribers requesting the same subscription with the same criteria
 * are literally requesting the same thing — so they get the same `Observable`, and the `EventBus` sees
 * a single subscriber. That is why the criteria are one field rather than loose properties on the
 * subclass: what goes into the key is explicit.
 *
 * ```ts
 * export class OnPostUpdatedSubscription extends Subscription<PostUpdatedEvent, { postId?: string | null }> {
 *   override match(event: PostUpdatedEvent): boolean {
 *     return !this.criteria.postId || event.postId === this.criteria.postId;
 *   }
 * }
 * ```
 *
 * With no criteria at all, `TCriteria` is `void` and the constructor can be called empty:
 * `class OnPostCreatedSubscription extends Subscription<PostCreatedEvent> {}` → `new OnPostCreatedSubscription()`.
 */
export abstract class Subscription<TEvent, TCriteria = void> {
  /** Type only — see {@link EVENT_TYPE_SYMBOL}. Never read at runtime. */
  readonly [EVENT_TYPE_SYMBOL]: TEvent;

  constructor(readonly criteria: TCriteria) {}

  /**
   * The filter: runs once per event, inside the stream, before it reaches any subscriber. The default
   * lets everything through — a subscription with no criteria filters nothing.
   */
  match(_event: TEvent): boolean {
    return true;
  }

  /**
   * This subscription's identity *as a request*: the type plus the criteria. Two instances with the
   * same key are interchangeable, and the bus serves them from a single stream.
   */
  get key(): string {
    return `${this.constructor.name}(${subscriptionKey(this.criteria)})`;
  }
}
