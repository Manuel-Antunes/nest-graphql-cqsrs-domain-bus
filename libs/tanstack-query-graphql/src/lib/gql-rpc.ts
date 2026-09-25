import type {
  InfiniteData,
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
} from '@tanstack/react-query';
import {
  infiniteQueryOptions as buildInfiniteQueryOptions,
  mutationOptions as buildMutationOptions,
  queryOptions as buildQueryOptions,
} from '@tanstack/react-query';

import { writeSubscriptionToGraphCache } from './cache/apollo-helpers';
import { normalizeSubscriptionError } from './error';
import { GraphCache } from './helpers';
import { normalizeQueryKey } from './request-string';
import type {
  ConnectionState,
  SubscriptionHandlers,
  SubscriptionOptions,
} from './subscriptions';
import { toUnsubscribe } from './subscriptions';
import type {
  GraphExecutor,
  GraphSubscriber,
  TypedDocumentString,
} from './types';

/**
 * `input` is required exactly when the operation declares variables. Codegen
 * types a variable-less operation as `Record<string, never>`.
 */
type QueryOptionsInput<TResult, TVariables> = (TVariables extends Record<
  string,
  never
>
  ? { input?: never }
  : { input: NoInfer<TVariables> }) &
  Omit<UseQueryOptions<TResult, Error, TResult>, 'queryKey' | 'queryFn'>;

type InfiniteQueryOptionsInput<
  TVariables,
  TQueryFnData,
  TError = Error,
  TData = InfiniteData<TQueryFnData, unknown>,
  TQueryKey extends QueryKey = readonly unknown[],
  TPageParam = unknown,
> = {
  input: (pageParam: TPageParam) => TVariables;
} & Omit<
  Parameters<
    typeof buildInfiniteQueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TPageParam
    >
  >[0],
  'queryKey' | 'queryFn'
>;

/**
 * The key a subscription is identified by.
 *
 * FOUR elements, and the second one is a literal — that is the point. The
 * query/mutation keys are `['graph', document, variables]` and `['graph',
 * document]`, and `GraphQueryCache` / `GraphMutationCache` mirror anything
 * matching them into Apollo's normalized cache. A subscription document is not
 * a query: `cache.writeQuery` would file its root fields under `ROOT_QUERY`,
 * where they do not belong. Being a different length keeps this key invisible
 * to `isGraphQLQueryKey` and `isGraphQLMutationKey` even if someone parks a
 * subscription payload in the React Query cache under it.
 *
 * It is still a *key*: `useSubscription` hashes it to decide when to tear a
 * stream down and open a new one.
 */
export type GqlSubscriptionKey = readonly [
  'graph',
  'subscription',
  string,
  Record<string, unknown>,
];

interface SubscriptionCallbacks<TResult> {
  /**
   * THE SWITCH: whether to open the stream at all. Say it outright —
   * `enabled: !!executionId` — because it is the line a reader looks at to
   * answer "does this subscribe yet", and readiness is often not the same
   * question as "are the variables there": `!!executionId && dialogIsOpen`.
   *
   * Defaults to `input !== null`, which is a GUARD rather than the mechanism:
   * without it, forgetting `enabled` would open a stream with no variables and
   * let the server reject an operation the client never meant to send.
   */
  enabled?: boolean;
  /** The stream has been opened. NOT an ack — see the README. */
  onStarted?: () => void;
  onData?: (data: TResult) => void;
  onError?: (error: Error) => void;
  /** The server ended the stream. Terminal. */
  onComplete?: () => void;
  /**
   * The CONNECTION changed — `connecting` → `pending` → `idle`, including a
   * re-connection after a drop. Reported separately from the result for the
   * same reason tRPC separates them: a retried stream is not a failed
   * subscription, and the UI that says "reconectando…" needs to hear about it
   * without the last snapshot being torn off the screen.
   */
  onConnectionStateChange?: (state: ConnectionState) => void;
  /**
   * Hand-written Apollo cache edits, per payload. Runs after the automatic
   * write below, so it observes an already-normalized store — the same order
   * `gqlMutationOptions` uses.
   */
  updateCache?: (cache: GraphCache, data: TResult) => void;
  /**
   * Normalize every payload into the Apollo cache under `ROOT_SUBSCRIPTION`,
   * the way Apollo's own client does. Defaults to `true`. Turn it off for a
   * stream whose payload is not entity-shaped and would only add noise —
   * progress counters, log lines, ticks.
   */
  writeToCache?: boolean;
}

/**
 * `input` is `null` when there is no value to put there yet — the execution id
 * has not been minted, the row is not selected. It is not how you turn the
 * subscription off (that is `enabled`); it is how you avoid lying about the
 * variable types while it is off, since the hook is called unconditionally on
 * every render. React counts hooks; it does not care that one is waiting.
 */
type SubscriptionOptionsInput<TResult, TVariables> = (TVariables extends Record<
  string,
  never
>
  ? { input?: never }
  : { input: NoInfer<TVariables> | null }) &
  SubscriptionCallbacks<TResult>;

/**
 * Builds type-safe TanStack Query options for GraphQL operations on top of an
 * app-scoped `execute`.
 *
 * The keys it mints — `['graph', normalizedDocument, variables]` for queries and
 * `['graph', normalizedDocument]` for mutations — are the contract that
 * `GraphQueryCache` / `GraphMutationCache` recognise to mirror results into
 * Apollo's normalized cache. Changing the key shape here silently disables that
 * mirroring; the queries keep working, they just stop sharing entities.
 *
 * Each app instantiates this once with its own transport and re-exports the
 * bound methods:
 *
 * ```ts
 * const gqlrpc = new GqlRpc(execute);
 * export const gqlQueryOptions: GqlRpc['gqlQueryOptions'] =
 *   gqlrpc.gqlQueryOptions.bind(gqlrpc);
 * ```
 */
export class GqlRpc<T, S = GraphSubscriber> {
  constructor(
    private readonly execute: T,
    private readonly cache: GraphCache,
    /**
     * The subscription transport. Optional because an app that never
     * subscribes should not have to invent one — `gqlSubscriptionOptions`
     * throws only if a stream is actually opened without it.
     *
     * Typed as a free generic for the same reason `execute` is: codegen's
     * `TypedDocumentString` has a private field, so an app's document type is
     * not structurally reachable from this lib's and a precise parameter type
     * here would reject every real transport.
     */
    private readonly subscriber?: S,
  ) {}

  /**
   * @param query - a codegen document
   * @param options - `input` (the operation's variables) plus any React Query option
   */
  gqlQueryOptions<TResult, TVariables>(
    query: TypedDocumentString<TResult, TVariables>,
    options?: QueryOptionsInput<TResult, TVariables>,
  ) {
    type OptionsType = { input?: TVariables } & Record<string, unknown>;
    const { input: params, ...queryOptions } = (options ?? {}) as OptionsType;

    const queryKey = [
      'graph',
      normalizeQueryKey(query.toString()),
      params ?? {},
    ] as const;

    return buildQueryOptions<TResult, Error, TResult>({
      queryKey,
      queryFn: async () => {
        if (params !== undefined) {
          return (await (this.execute as GraphExecutor)<TResult, any>(
            query,
            params,
          )) as TResult;
        }
        return (await (this.execute as any)(query)) as TResult;
      },
      ...queryOptions,
    });
  }

  /**
   * @param query - a codegen document
   * @param options - `input` maps the current page param to variables, plus any
   *   React Query infinite option
   */
  gqlInfiniteOptions<
    TVariables,
    TQueryFnData,
    TError = Error,
    TData = InfiniteData<TQueryFnData, unknown>,
    TQueryKey extends QueryKey = readonly unknown[],
    TPageParam = unknown,
  >(
    query: TypedDocumentString<TQueryFnData, TVariables>,
    options: InfiniteQueryOptionsInput<
      TVariables,
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TPageParam
    >,
  ) {
    const { input: inputFn, ...infiniteOptions } = options;

    // Variables are deliberately left out of the key: they change per page, and
    // every page belongs to the same logical query.
    const queryKey = ['graph', normalizeQueryKey(query.toString())] as const;

    return buildInfiniteQueryOptions({
      queryKey: queryKey as unknown as TQueryKey,
      queryFn: async ({ pageParam }) => {
        const variables = inputFn(pageParam as TPageParam);
        return (await (this.execute as any)(query, variables)) as TQueryFnData;
      },
      ...infiniteOptions,
    });
  }

  /**
   * @param query - a codegen document
   * @param options - React Query mutation options; variables are passed to `mutate`
   */
  gqlMutationOptions<TResult, TVariables>(
    query: TypedDocumentString<TResult, TVariables>,
    options?: Omit<
      UseMutationOptions<TResult, Error, TVariables>,
      'mutationFn'
    > & {
      /**
       * Update GraphCache after a successful mutation. This is called before the user-provided `onSuccess` callback.
       * @param cache - The GraphCache instance to update.
       * @param data - The result of the mutation.
       * @returns void
       */
      updateCache?: (cache: GraphCache, data: TResult) => void;
    },
  ) {
    const mutationKey = ['graph', normalizeQueryKey(query.toString())];

    return buildMutationOptions<TResult, Error, TVariables>({
      mutationKey,
      mutationFn: async (variables: TVariables) =>
        (await (this.execute as any)(query, variables)) as TResult,
      ...options,
      onSuccess: async (data, variables, onMutateResult, context) => {
        if (options?.updateCache) {
          options.updateCache(this.cache, data);
        }
        return await options?.onSuccess?.(
          data,
          variables,
          onMutateResult,
          context,
        );
      },
    });
  }

  /**
   * @param query - a codegen subscription document
   * @param options - `input` (the operation's variables, or `null` while there
   *   is nothing to watch) plus the lifecycle callbacks
   *
   * Returns options, not a subscription: nothing is opened until
   * `useGqlSubscription` decides to. That split is what lets the call site read
   * like a query — one expression per render, no refs, no imperative start —
   * while the stream's lifetime stays tied to the component's.
   */
  gqlSubscriptionOptions<TResult, TVariables>(
    query: TypedDocumentString<TResult, TVariables>,
    options?: SubscriptionOptionsInput<TResult, TVariables>,
  ): SubscriptionOptions<TResult> {
    type OptionsType = { input?: TVariables | null } & Record<string, unknown>;
    const {
      input: params,
      enabled,
      updateCache,
      writeToCache,
      onStarted,
      onData,
      onError,
      onComplete,
      onConnectionStateChange,
    } = (options ?? {}) as OptionsType & SubscriptionCallbacks<TResult>;

    const document = normalizeQueryKey(query.toString());
    const variables = (params ?? {}) as Record<string, unknown>;

    const queryKey = [
      'graph',
      'subscription',
      document,
      variables,
    ] as const satisfies GqlSubscriptionKey;

    // `null` means "not ready"; `undefined` means "this operation takes no
    // variables". Only the first one holds the stream back.
    const isEnabled = enabled ?? params !== null;

    const subscribe = (handlers: SubscriptionHandlers<TResult>) => {
      if (!this.subscriber) {
        throw new Error(
          'GqlRpc has no subscription transport. Pass one as the third constructor argument to open subscriptions.',
        );
      }

      const handle = (this.subscriber as GraphSubscriber)<TResult, TVariables>(
        query,
        (params ?? undefined) as TVariables,
        {
          next: (data) => {
            if (writeToCache !== false) {
              writeSubscriptionToGraphCache(
                this.cache,
                query.toString(),
                variables,
                data,
              );
            }
            updateCache?.(this.cache, data);
            handlers.next(data);
          },
          // Normalized HERE, at the GraphQL boundary: a bare `GraphQLError[]`
          // becomes a `GraphQLResponseError`, so `status` / `code` / `hasCode`
          // work on a subscription failure exactly as on a query one. The hook
          // is generic and would only have wrapped it in a plain `Error`.
          error: (raw) => handlers.error?.(normalizeSubscriptionError(raw)),
          complete: handlers.complete,
          connecting: handlers.connecting,
          connected: handlers.connected,
        },
      );

      return toUnsubscribe(handle);
    };

    return {
      enabled: isEnabled,
      queryKey,
      subscribe,
      onStarted,
      onData,
      onError,
      onComplete,
      onConnectionStateChange,
    };
  }
}
