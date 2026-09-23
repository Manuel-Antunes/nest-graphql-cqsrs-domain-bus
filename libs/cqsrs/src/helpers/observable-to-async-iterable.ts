import type { Observable, Subscription } from 'rxjs';

/**
 * `Observable<T>` → `AsyncIterableIterator<T>`: the bridge between RxJS (what the `EventBus` and the
 * `SubscriptionBus` speak) and a *pull* consumer such as graphql-js — which consumes a subscription as
 * an *async iterator*. It is what separates CQSRS from the transport: the bus does not know what
 * GraphQL is, and the resolver does not know what RxJS is.
 *
 * ## Why not a `ReadableStream`, a `Readable` or an `async function*`
 * All three are async-iterable by nature, but they **serialize `return()` behind a pending `next()`**:
 * a GraphQL subscription spends its whole life waiting for the next event, and when the client
 * disconnects graphql-js calls `return()` — which would only resolve once the next event arrived.
 * Until then the subscriber would stay alive on the `EventBus`. An iterator with an explicit queue does
 * not have that problem: `return()` resolves pending `next()` calls with `done: true` immediately and
 * cancels the Observable subscription. Same mechanics as `graphql-subscriptions`'s
 * `PubSubAsyncIterableIterator`, only wired to an Observable instead of a PubSub.
 *
 * ## Lifecycle
 * - the Observable subscription happens here, on creation — the resolver is called once per GraphQL
 *   subscriber, so each subscriber is exactly one subscription to the stream the `SubscriptionBus`
 *   handed out (how many `EventBus` subscriptions that becomes is the bus's decision, which shares by
 *   key);
 * - the Observable's `next`/`error`/`complete` feed the queue (or serve a `next()` already waiting);
 * - `return()` (client disconnected) and `throw()` cancel the subscription. Nothing leaks.
 *
 * It is an *iterator* that is also *iterable* (`[Symbol.asyncIterator]` returns itself): graphql-js
 * asks for `[Symbol.asyncIterator]()`, while a wrapper such as `withFilter` calls `next()` directly on
 * whatever the resolver returned. Both walk over the same subscription.
 *
 * There is no real backpressure (the `EventBus` is push; the queue grows), the same contract as the
 * in-memory PubSub — and enough for a proof of concept.
 */
export function observableToAsyncIterable<T>(source: Observable<T>): AsyncIterableIterator<T> {
  /** Emitted values nobody has asked for yet. */
  const buffered: T[] = [];
  /** `next()` calls that do not have a value to return yet. */
  const waiting: Array<{ resolve: (result: IteratorResult<T>) => void; reject: (error: unknown) => void }> = [];
  let finished = false;
  let failure: { error: unknown } | undefined;
  /** `let`, not `const`: an Observable may error or complete synchronously, still inside `subscribe`. */
  let subscription: Subscription | undefined;
  const done = (): IteratorResult<T> => ({ value: undefined, done: true });

  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    subscription?.unsubscribe();
    for (const pending of waiting.splice(0)) {
      if (failure) {
        pending.reject(failure.error);
      } else {
        pending.resolve(done());
      }
    }
  };

  subscription = source.subscribe({
    next: (value) => (waiting.length ? waiting.shift()!.resolve({ value, done: false }) : buffered.push(value)),
    error: (error) => {
      failure = { error };
      finish();
    },
    complete: finish,
  });

  return {
    next: () => {
      if (buffered.length) {
        return Promise.resolve({ value: buffered.shift()!, done: false });
      }
      if (failure) {
        return Promise.reject(failure.error);
      }
      if (finished) {
        return Promise.resolve(done());
      }
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
    return: () => {
      finish();
      return Promise.resolve(done());
    },
    throw: (error) => {
      finish();
      return Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
