import * as React from 'react';
import { hashKey } from '@tanstack/react-query';

import type {
  ConnectionState,
  SubscriptionOptions,
  SubscriptionResult,
  SubscriptionStatus,
  Unsubscribe,
} from './types';
import { toError } from './types';

interface SubscriptionState<TData> {
  status: SubscriptionStatus;
  data: TData | undefined;
  error: Error | null;
}

function initialState<TData>(enabled: boolean): SubscriptionState<TData> {
  return {
    status: enabled ? 'connecting' : 'idle',
    data: undefined,
    error: null,
  };
}

/**
 * Runs a subscription for as long as the component is mounted and `enabled` is
 * true.
 *
 * Knows nothing about GraphQL. It takes a `subscribe` function, a key to
 * identify it by, and callbacks — so a WebSocket, an `EventSource`, a Web
 * Worker port or an in-memory event bus wires in exactly the same way. What
 * makes it worth having next to TanStack Query is the shared vocabulary:
 * `enabled`, a `queryKey`, and a result that reads like `useQuery`'s.
 *
 * ## Why this looks like `useQuery` and not like `subscribe()`
 *
 * The imperative shape — `const stop = subscribe(doc, vars, handlers)` inside a
 * callback, kept in a ref — forces every screen that watches something to
 * re-solve the same three problems: unsubscribing on unmount, unsubscribing
 * before re-subscribing, and not calling a hook conditionally when the thing to
 * watch does not exist yet. Here the hook is called on every render, always, and
 * `enabled` decides. A batch that has not been dispatched yet is
 * `enabled: false` — one boolean, not a branch.
 *
 * ## The contract is tRPC's
 *
 * Same statuses, same discriminated union, same split between the CONNECTION
 * (`onConnectionStateChange`) and the RESULT (`status` / `data` / `error`) as
 * `@trpc/tanstack-react-query`'s `useSubscription`, because that split is what
 * makes a dropped-and-retried stream expressible: the connection goes back to
 * `connecting` while the last snapshot stays on screen. The one addition is
 * `complete` — see {@link SubscriptionStatus}.
 *
 * | transition                | what happens                                    |
 * | ------------------------- | ----------------------------------------------- |
 * | `enabled` false → true    | stream opens, `status: 'connecting'`             |
 * | transport connected       | `status: 'pending'` — `data` may still be unset  |
 * | first payload             | `status: 'pending'`, `data` set                  |
 * | connection drops, retries | back to `connecting`, `data` KEPT                |
 * | variables change          | old stream closed, state reset, new one opened   |
 * | `restart()`               | same, but `data` is KEPT — same logical stream   |
 * | `enabled` true → false    | stream closed, back to `idle`, `data` cleared    |
 * | unmount                   | stream closed                                    |
 *
 * `data` is the LAST payload, not an accumulation. Every subscription in this
 * repo publishes full snapshots — that is what makes a dropped stream a
 * non-event, since the next frame corrects the client — so keeping a list would
 * only be right for a stream that publishes deltas. Use `onData` for those.
 *
 * ## Ordering, for an operation the client keys itself
 *
 * A batch is watched on an id the CLIENT mints, so the stream has to exist
 * before the mutation that feeds it is sent — a run can finish in 300ms, and an
 * event published to a subject nobody is listening on is gone.
 *
 * That is a `useEffect` away, and needs nothing from this hook beyond `status`:
 * put the id in state, let it drive `enabled`, and send the mutation when the
 * status reaches `'pending'` — which is precisely "the server accepted the
 * stream". Guard it on the id so a reconnect does not re-send.
 *
 * ```ts
 * const sent = React.useRef<string | null>(null);
 * React.useEffect(() => {
 *   if (sub.status !== 'pending' || !batchKey || sent.current === batchKey) return;
 *   sent.current = batchKey;
 *   void mutateAsync({ input: { batchKey, ... } });
 * }, [sub.status, batchKey]);
 * ```
 *
 * ⚠️ This needs a transport that reports `connected`. Without one the status
 * only reaches `'pending'` on the first PAYLOAD, and a stream whose first
 * payload is caused by the mutation would wait for itself forever.
 */
export function useSubscription<TData>(
  options: SubscriptionOptions<TData>,
): SubscriptionResult<TData> {
  const { enabled } = options;
  const keyHash = hashKey(options.queryKey);

  /**
   * The latest options, read at effect time. The callbacks are almost always
   * inline arrows, so a new identity every render: depending on them would tear
   * the stream down and open a new one on each parent re-render.
   */
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const [state, setState] = React.useState<SubscriptionState<TData>>(() =>
    initialState<TData>(enabled),
  );

  /**
   * Reset DURING render rather than in an effect (React's documented
   * "adjusting state when a prop changes"). An effect would commit one frame
   * showing the previous batch's progress under the new batch's id.
   *
   * `attempt` is deliberately absent: a `restart()` re-opens the same logical
   * stream, so blanking a progress bar that is about to be refilled with the
   * same numbers would be a flicker, not information.
   */
  const resetKey = `${keyHash}|${enabled ? 1 : 0}`;
  const [lastResetKey, setLastResetKey] = React.useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setState(initialState<TData>(enabled));
  }

  const [attempt, setAttempt] = React.useState(0);

  /**
   * Back to `connecting` — a stream that ended (`error`, `complete`) would
   * otherwise keep reporting its terminal status while the new one is already
   * open — but `data` survives, see the reset above. A restart while disabled
   * is a no-op: there is nothing to re-open.
   */
  const restart = React.useCallback(() => {
    if (!optionsRef.current.enabled) return;
    setState((prev) => ({
      status: 'connecting',
      data: prev.data,
      error: null,
    }));
    setAttempt((n) => n + 1);
  }, []);

  /**
   * The connection state last reported, so the same one is never announced
   * twice. It has two sources — the transport's own events and, for a transport
   * that reports none, the first payload — and they must not double-fire.
   */
  const connectionRef = React.useRef<ConnectionState['state']>('idle');

  const emitConnection = React.useCallback(
    (
      state: ConnectionState['state'],
      error: Error | null,
      reconnecting = false,
    ) => {
      if (connectionRef.current === state) return;
      connectionRef.current = state;
      optionsRef.current.onConnectionStateChange?.({
        state,
        error,
        reconnecting,
      });
    },
    [],
  );

  React.useEffect(() => {
    if (!enabled) return;

    let active = true;
    let unsubscribe: Unsubscribe | undefined;

    try {
      unsubscribe = optionsRef.current.subscribe({
        next: (data) => {
          if (!active) return;
          optionsRef.current.onData?.(data);
          // A payload is proof of a working stream, which is all a transport
          // that reports no connection events will ever give us.
          emitConnection('pending', null);
          setState({ status: 'pending', data, error: null });
        },
        error: (raw) => {
          if (!active) return;
          const error = toError(raw);
          optionsRef.current.onError?.(error);
          emitConnection('idle', error);
          // The transport has given up on this stream — `data` is kept because
          // the last snapshot is still the truest thing we know.
          setState((prev) => ({ status: 'error', data: prev.data, error }));
        },
        complete: () => {
          if (!active) return;
          optionsRef.current.onComplete?.();
          emitConnection('idle', null);
          setState((prev) => ({
            status: 'complete',
            data: prev.data,
            error: null,
          }));
        },
        connecting: (reconnecting) => {
          if (!active) return;
          emitConnection('connecting', null, reconnecting);
          // A retry is not a failure: the last snapshot stays on screen while
          // the transport re-opens the stream underneath it.
          setState((prev) => ({
            status: 'connecting',
            data: prev.data,
            error: null,
          }));
        },
        connected: (reconnected) => {
          if (!active) return;
          emitConnection('pending', null, reconnected);
          setState((prev) => ({
            status: 'pending',
            data: prev.data,
            error: null,
          }));
        },
      });
    } catch (raw) {
      // A transport that throws synchronously (no transport configured at all,
      // a malformed document) must not take the render down with it.
      const error = toError(raw);
      optionsRef.current.onError?.(error);
      emitConnection('idle', error);
      setState((prev) => ({ status: 'error', data: prev.data, error }));
      return;
    }

    // Only if the transport did not already report one synchronously — some do
    // (`graphql-sse` fires `connecting` inside `subscribe`), and this must not
    // walk a reported state backwards.
    if (connectionRef.current === 'idle') emitConnection('connecting', null);
    optionsRef.current.onStarted?.();

    return () => {
      active = false;
      emitConnection('idle', null);
      unsubscribe?.();
    };
    // `attempt` is the restart lever: it belongs in the deps precisely because
    // the body does not read it.
  }, [enabled, keyHash, attempt, emitConnection]);

  /**
   * The cast is the state machine's invariants, which the union spells out and
   * the transitions above uphold: `error` is non-null exactly under `'error'`,
   * `data` is unset exactly under `'idle'`.
   */
  return {
    ...state,
    isSubscribed: state.status === 'connecting' || state.status === 'pending',
    restart,
  } as SubscriptionResult<TData>;
}
