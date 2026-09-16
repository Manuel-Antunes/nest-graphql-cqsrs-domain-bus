import { map, type Observable } from 'rxjs';
import type { Subscription } from '../classes/subscription';
import type { ISubscriptionBus } from '../interfaces/subscription-bus.interface';
import { observableToAsyncIterable } from './observable-to-async-iterable';

/**
 * The interface layer's helper: asks the bus for the subscription, projects each event into the
 * protocol's shape and returns the async iterable the transport consumes. It is the entire body of a
 * GraphQL subscription resolver:
 *
 * ```ts
 * @Subscription(() => PostView, { name: 'onPostUpdated', resolve: (payload: PostView) => payload })
 * onPostUpdated(@Args('postId', { type: () => ID, nullable: true }) postId?: string | null) {
 *   return subscribeAsAsyncIterable(
 *     this.subscriptionBus,
 *     new OnPostUpdatedSubscription.OnPostUpdated({ postId }),
 *     (event) => this.viewMapper.fromUpdatedEvent(event),
 *   );
 * }
 * ```
 *
 * Note what the interface does and what it does not: it **assembles the criteria** from the protocol's
 * arguments (`postId`) and **translates the event** into the view. It does not filter — the filter is
 * the subscription's `match` method, in the application layer, and it runs inside the stream. No
 * `filter` on `@Subscription`, no `filter()` on the resolver's Observable.
 *
 * Nothing here imports GraphQL: an async iterable is the contract of any *pull* consumer.
 *
 * @param bus The `SubscriptionBus`.
 * @param subscription The requested subscription, criteria included.
 * @param project Event → what the subscriber receives. The default hands the event over untouched.
 */
export function subscribeAsAsyncIterable<TEvent, TOut = TEvent>(
  bus: ISubscriptionBus,
  subscription: Subscription<TEvent, any>,
  project: (event: TEvent) => TOut = (event) => event as unknown as TOut,
): AsyncIterableIterator<TOut> {
  const stream: Observable<TEvent> = bus.subscribe(subscription);
  return observableToAsyncIterable(stream.pipe(map(project)));
}
