import type { Plugin } from 'graphql-yoga';

const SECONDS = 1000;

/**
 * **A subscription that ends itself, because on Lambda nobody else will.**
 *
 * An SSE subscription is a response that stays open, and the invocation serving it lives exactly as
 * long as that response. On a server that is the right trade; on Lambda it is a bill, because
 * **the function is never told that the client went away**. Measured on the deployed stack: a client
 * killed after 19 seconds left the invocation running for the remaining 281, and the only thing that
 * ended it was `Status: timeout` at 300s. The response stream reported `writable=true` and emitted
 * neither `close` nor `error` nor `aborted` the whole time — the function writes into the Lambda
 * service's response channel, and the client's socket was never its to observe.
 *
 * Nothing downstream can notice either: the subscriber stays on the `EventBus`, so the
 * `EventSourcedEventBus`'s `share({ resetOnRefCountZero: true })` never resets and its 200ms poll of
 * `event_log` runs to the timeout — 1500 reads for a client that left.
 *
 * So the only place a bound can exist is here, ahead of the client: `return()` on the result stream
 * is what `graphql-sse` sees as the end of a stream, and its client reconnects on its own.
 *
 * **What it costs, and it is not nothing.** A stream that begins again begins at the log's `head()`
 * — `EventSourcedEventBus` says a subscriber that went away is not owed what it missed — so events
 * published inside a reconnect are lost. That window already existed for any reconnect; this makes it
 * routine, once per deadline. Closing it means resuming from a position rather than from the head,
 * which the feed's cursor could support and the client does not ask for yet.
 *
 * Off unless `SUBSCRIPTION_MAX_SECONDS` says otherwise, because only a deployment knows whether its
 * host kills long responses. `infra/aws` sets it; a server, a container and a test do not.
 */
export const subscriptionDeadline = (seconds: number): Plugin => ({
  onSubscribe() {
    return {
      onSubscribeResult({ result }) {
        const stream = result as AsyncIterableIterator<unknown>;
        if (typeof stream?.return !== 'function') {
          return;
        }

        /**
         * `return()` and not a wrapping iterator: an `async function*` around this would serialize
         * its own `return()` behind a pending `next()`, which is the leak `subscribeAsAsyncIterable`
         * exists to avoid. Ending the stream from outside has no such shape. It is safe to fire at a
         * stream that already ended — `return()` on a finished iterator is a no-op.
         */
        const deadline = setTimeout(() => {
          void stream.return?.();
        }, seconds * SECONDS);
        deadline.unref?.();
      },
    };
  },
});
