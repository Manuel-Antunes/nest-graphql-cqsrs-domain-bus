/**
 * The generic half: a contract between TanStack Query and *any* stream, with no
 * GraphQL in it. Everything GraphQL-shaped — the document, the variables, the
 * normalized cache, the error type — is the option builder's business, and
 * reaches this side already reduced to `subscribe`, a `queryKey` and callbacks.
 *
 * Kept apart so it can be lifted out into a standalone
 * react-query-meets-subscriptions package without rewriting anything: nothing
 * in this folder imports from outside it, except `@tanstack/react-query` and
 * React.
 */

/**
 * What a subscription transport hands back so the caller can stop listening.
 *
 * Both shapes are accepted because both are in the wild: `graphql-sse` and
 * `graphql-ws` return the bare function, while anything RxJS-shaped (Apollo,
 * tRPC) returns the object. Normalizing here costs three lines and spares every
 * transport from adapting.
 */
export type Unsubscribe = () => void;

export interface Unsubscribable {
  unsubscribe: () => void;
}

/** What the stream calls as it produces. */
export interface SubscriptionHandlers<TData> {
  next: (data: TData) => void;
  error?: (error: unknown) => void;
  complete?: () => void;
  /**
   * The connection is being opened, `reconnecting` when it is being re-opened
   * after a drop. Optional on BOTH sides: a transport that cannot observe its
   * own connection simply never calls it, and the hook then treats the first
   * payload as the proof of a working stream.
   *
   * Named after `graphql-sse`'s and `graphql-ws`'s own event listeners, which
   * both report exactly this per subscription — so wiring is a pass-through
   * rather than a translation.
   */
  connecting?: (reconnecting: boolean) => void;
  /** The server accepted the stream. `reconnected` after a drop. */
  connected?: (reconnected: boolean) => void;
}

/**
 * tRPC's four, plus `complete`.
 *
 * Deliberately the same words `@trpc/tanstack-react-query`'s `useSubscription`
 * uses, with the same meanings: the status describes the CONNECTION, not the
 * payload. `pending` means the server accepted the stream and is publishing on
 * it — `data` may still be `undefined` because nothing has been published yet.
 *
 * `complete` is the one addition, and it is not decoration: tRPC returns to
 * `idle` when a subscription ends, which clears `data`. A stream that ends by
 * publishing its RESULT — a finished batch's download URL — would have that
 * result thrown away on the frame it arrived.
 *
 * ⚠️ `pending` is NOT TanStack Query's `pending`. In `useQuery` it means "no
 * data yet"; here it means connected and flowing. `if (sub.status ===
 * 'pending') return <Spinner />` is the mistake this note exists to prevent.
 */
export type SubscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'pending'
  | 'error'
  | 'complete';

/**
 * The connection underneath the subscription, reported separately from the
 * result — same split tRPC makes, and for the same reason: a stream that drops
 * and is retried is not a failed subscription, it is a connection that is
 * `connecting` again while the last snapshot stays on screen.
 *
 * Three states only. `error` and `complete` are results, not connections; both
 * leave the connection `idle`, the terminal error riding along in `error`.
 */
export interface ConnectionState {
  state: 'idle' | 'connecting' | 'pending';
  error: Error | null;
  /** `true` when this is a re-connection after the stream dropped. */
  reconnecting: boolean;
}

/**
 * What {@link useSubscription} consumes — the counterpart of the object
 * `queryOptions()` returns, minus TanStack's ownership of it.
 *
 * An option builder produces this. `subscribe` closes over whatever the stream
 * needs (a document and variables, a socket path, an id), so the hook only has
 * to decide *when* to call it.
 */
export interface SubscriptionOptions<TData> {
  /** `false` means "do not open the stream" — the hook still runs, idle. */
  enabled: boolean;
  /**
   * Identity. The hook hashes it to decide when to tear a stream down and open
   * a new one — it does NOT put anything in the query cache under it.
   */
  queryKey: readonly unknown[];
  /** Opens the stream. Returns the (normalized) unsubscribe. */
  subscribe: (handlers: SubscriptionHandlers<TData>) => Unsubscribe;
  onStarted?: () => void;
  onData?: (data: TData) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
}

interface SubscriptionBaseResult<TData> {
  status: SubscriptionStatus;
  /** The LAST payload, not an accumulation — see {@link useSubscription}. */
  data: TData | undefined;
  error: Error | null;
  /** The connection, not the result — `connecting` counts. */
  isSubscribed: boolean;
  /** Tear the stream down and open a fresh one with the same options. */
  restart: () => void;
}

/** Not enabled: there is nothing to watch yet, and nothing was opened. */
export interface SubscriptionIdleResult<TData>
  extends SubscriptionBaseResult<TData> {
  status: 'idle';
  data: undefined;
  error: null;
  isSubscribed: false;
}

/**
 * Opening — or re-opening after a drop, which is why `data` survives here. The
 * last snapshot is still the truest thing known while the transport retries.
 */
export interface SubscriptionConnectingResult<TData>
  extends SubscriptionBaseResult<TData> {
  status: 'connecting';
  data: TData | undefined;
  error: null;
  isSubscribed: true;
}

/** Connected. `data` is `undefined` until the first payload is published. */
export interface SubscriptionPendingResult<TData>
  extends SubscriptionBaseResult<TData> {
  status: 'pending';
  data: TData | undefined;
  error: null;
  isSubscribed: true;
}

/** Terminal. The last snapshot is kept — it is still what we know. */
export interface SubscriptionErrorResult<TData>
  extends SubscriptionBaseResult<TData> {
  status: 'error';
  data: TData | undefined;
  error: Error;
  isSubscribed: false;
}

/** Terminal: the server ended the stream. `restart()` opens a new one. */
export interface SubscriptionCompleteResult<TData>
  extends SubscriptionBaseResult<TData> {
  status: 'complete';
  data: TData | undefined;
  error: null;
  isSubscribed: false;
}

/**
 * A discriminated union, so `error` narrows to non-null under `status ===
 * 'error'` and the call site never reaches for `!`.
 */
export type SubscriptionResult<TData> =
  | SubscriptionIdleResult<TData>
  | SubscriptionConnectingResult<TData>
  | SubscriptionPendingResult<TData>
  | SubscriptionErrorResult<TData>
  | SubscriptionCompleteResult<TData>;

/** Accepts either transport shape, returns the one the hook calls. */
export function toUnsubscribe(
  handle: Unsubscribe | Unsubscribable,
): Unsubscribe {
  return typeof handle === 'function' ? handle : () => handle.unsubscribe();
}

/**
 * The last-resort coercion: `error` is typed `Error`, and a transport can
 * report anything.
 *
 * Deliberately shallow. A builder that knows the protocol should hand this side
 * a real error already — `gqlSubscriptionOptions` rebuilds a bare
 * `GraphQLError[]` into a `GraphQLResponseError` so `status` and `code` survive
 * — and then this is a pass-through.
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;

  const reason =
    error && typeof error === 'object' && 'reason' in error
      ? String((error as { reason: unknown }).reason)
      : undefined;

  return new Error(reason || 'Subscription failed', { cause: error });
}
