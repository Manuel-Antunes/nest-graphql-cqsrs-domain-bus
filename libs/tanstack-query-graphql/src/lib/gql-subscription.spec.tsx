/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphQLResponseError } from './error';
import { GqlRpc } from './gql-rpc';
import type { GraphCache } from './helpers';
import { InMemoryGraphCache } from './helpers';
import type { SubscriptionHandlers } from './subscriptions';
import { useSubscription } from './subscriptions';
import type { TypedDocumentString } from './types';

/**
 * The GraphQL half: everything `gqlSubscriptionOptions` does BEFORE the generic
 * hook sees anything — the key it mints, the variables it forwards, the Apollo
 * writes, and the error type it rebuilds.
 *
 * The hook's own behaviour is not retested here. It lives in
 * `subscriptions/use-subscription.spec.tsx`, deliberately with no GraphQL in
 * it, because that is the contract that would survive being lifted into a
 * standalone package. What this file adds is that the two compose.
 */

/** Codegen documents are `String` subclasses; these tests only need `toString`. */
function doc<TResult, TVariables>(
  source: string,
): TypedDocumentString<TResult, TVariables> {
  return { toString: () => source } as TypedDocumentString<TResult, TVariables>;
}

interface Progress {
  __typename: 'BatchOperationProgress';
  batchKey: string;
  status: string;
  succeededCount: number;
}

const ON_PROGRESS = doc<{ onBulkGenerate: Progress }, { batchKey: string }>(
  `subscription OnBulkGenerate($batchKey: ID!) {
     onBulkGenerate(batchKey: $batchKey) {
       __typename batchKey status succeededCount
     }
   }`,
);

const ON_TICK = doc<
  { onTick: { __typename: 'Tick'; at: string } },
  Record<string, never>
>('subscription OnTick { onTick { __typename at } }');

/** One open stream, as the fake transport sees it. */
interface OpenStream {
  variables: unknown;
  handlers: SubscriptionHandlers<any>;
  unsubscribe: Mock<() => void>;
}

function createTransport() {
  const streams: OpenStream[] = [];

  const subscribe = vi.fn(
    (
      _query: unknown,
      variables: unknown,
      handlers: SubscriptionHandlers<any>,
    ) => {
      const stream: OpenStream = {
        variables,
        handlers,
        unsubscribe: vi.fn(),
      };
      streams.push(stream);
      return () => stream.unsubscribe();
    },
  );

  return {
    subscribe,
    streams,
    /** The stream opened last — the one the hook is currently holding. */
    get current() {
      return streams[streams.length - 1];
    },
    get openCount() {
      return streams.filter((s) => s.unsubscribe.mock.calls.length === 0)
        .length;
    },
  };
}

function createRpc(cache: GraphCache = new InMemoryGraphCache()) {
  const transport = createTransport();
  const rpc = new GqlRpc(vi.fn(), cache, transport.subscribe);
  return {
    transport,
    cache,
    gqlSubscriptionOptions: rpc.gqlSubscriptionOptions.bind(rpc),
  };
}

const snapshot = (overrides: Partial<Progress> = {}): Progress => ({
  __typename: 'BatchOperationProgress',
  batchKey: 'batch-1',
  status: 'RUNNING',
  succeededCount: 1,
  ...overrides,
});

describe('gqlSubscriptionOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('takes the variables from the document, so one whose variables are all optional accepts an empty input', () => {
    const { gqlSubscriptionOptions } = createRpc();
    const onUpdated = doc<
      { onUpdated: { __typename: 'Post'; id: string } },
      { postId?: string | null }
    >(
      'subscription OnUpdated($postId: ID) { onUpdated(postId: $postId) { __typename id } }',
    );

    const options = gqlSubscriptionOptions(onUpdated, { input: {} });

    expect(options.enabled).toBe(true);
    expect(options.queryKey[3]).toEqual({});
  });

  it('mints a four-element key that neither cache mirror recognises', () => {
    const { gqlSubscriptionOptions } = createRpc();

    const options = gqlSubscriptionOptions(ON_PROGRESS, {
      input: { batchKey: 'batch-1' },
    });

    expect(options.queryKey).toEqual([
      'graph',
      'subscription',
      'subscription OnBulkGenerate($batchKey: ID!) { onBulkGenerate(batchKey: $batchKey) { __typename batchKey status succeededCount } }',
      { batchKey: 'batch-1' },
    ]);
  });

  it('is enabled by default, and disabled by a null input', () => {
    const { gqlSubscriptionOptions } = createRpc();

    expect(
      gqlSubscriptionOptions(ON_PROGRESS, { input: { batchKey: 'b' } }).enabled,
    ).toBe(true);
    expect(gqlSubscriptionOptions(ON_PROGRESS, { input: null }).enabled).toBe(
      false,
    );
    // No variables at all is not "not ready".
    expect(gqlSubscriptionOptions(ON_TICK).enabled).toBe(true);
  });

  it('lets an explicit enabled override the input', () => {
    const { gqlSubscriptionOptions } = createRpc();

    expect(
      gqlSubscriptionOptions(ON_PROGRESS, {
        input: { batchKey: 'b' },
        enabled: false,
      }).enabled,
    ).toBe(false);
  });

  it('opens the stream through the transport with the operation variables', () => {
    const { gqlSubscriptionOptions, transport } = createRpc();

    const options = gqlSubscriptionOptions(ON_PROGRESS, {
      input: { batchKey: 'batch-1' },
    });
    options.subscribe({ next: vi.fn() });

    expect(transport.subscribe).toHaveBeenCalledTimes(1);
    expect(transport.current.variables).toEqual({ batchKey: 'batch-1' });
  });

  it('throws a named error when no transport was configured', () => {
    const rpc = new GqlRpc(vi.fn(), new InMemoryGraphCache());
    const options = rpc.gqlSubscriptionOptions(ON_PROGRESS, {
      input: { batchKey: 'batch-1' },
    });

    expect(() => options.subscribe({ next: vi.fn() })).toThrow(
      /no subscription transport/i,
    );
  });

  it('normalizes an unsubscribe object into a function', () => {
    const unsubscribe = vi.fn();
    const rpc = new GqlRpc(vi.fn(), new InMemoryGraphCache(), () => ({
      unsubscribe,
    }));

    const stop = rpc
      .gqlSubscriptionOptions(ON_PROGRESS, { input: { batchKey: 'b' } })
      .subscribe({ next: vi.fn() });
    stop();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('rebuilds a bare GraphQL error array before anyone downstream sees it', () => {
    const { gqlSubscriptionOptions, transport } = createRpc();
    const received: unknown[] = [];

    const options = gqlSubscriptionOptions(ON_PROGRESS, {
      input: { batchKey: 'batch-1' },
    });
    options.subscribe({
      next: vi.fn(),
      error: (error) => received.push(error),
    });

    transport.current.handlers.error?.([
      { message: 'Forbidden', extensions: { code: 'FORBIDDEN' } },
    ]);

    const [error] = received;
    expect(GraphQLResponseError.is(error)).toBe(true);
    expect((error as GraphQLResponseError).status).toBe(403);
  });

  describe('cache', () => {
    it('normalizes every payload under ROOT_SUBSCRIPTION, not ROOT_QUERY', () => {
      const cache = new InMemoryGraphCache();
      const { gqlSubscriptionOptions, transport } = createRpc(cache);

      const options = gqlSubscriptionOptions(ON_PROGRESS, {
        input: { batchKey: 'batch-1' },
      });
      options.subscribe({ next: vi.fn() });
      transport.current.handlers.next({ onBulkGenerate: snapshot() });

      const extracted = cache.extract() as Record<string, any>;
      expect(extracted['ROOT_SUBSCRIPTION']).toBeDefined();
      // The root field of a subscription is not a query field. Filing it under
      // ROOT_QUERY is what `writeQuery` would have done, and it would make a
      // `readQuery` for an unrelated query see a field it never selected.
      expect(extracted['ROOT_QUERY']).toBeUndefined();
    });

    it('skips the write when writeToCache is false', () => {
      const cache = new InMemoryGraphCache();
      const { gqlSubscriptionOptions, transport } = createRpc(cache);

      const options = gqlSubscriptionOptions(ON_PROGRESS, {
        input: { batchKey: 'batch-1' },
        writeToCache: false,
      });
      options.subscribe({ next: vi.fn() });
      transport.current.handlers.next({ onBulkGenerate: snapshot() });

      expect(cache.extract()).toEqual({});
    });

    it('runs updateCache with the cache and the payload, before the consumer', () => {
      const cache = new InMemoryGraphCache();
      const { gqlSubscriptionOptions, transport } = createRpc(cache);
      const order: string[] = [];

      const options = gqlSubscriptionOptions(ON_PROGRESS, {
        input: { batchKey: 'batch-1' },
        updateCache: (received) => {
          order.push('updateCache');
          expect(received).toBe(cache);
        },
      });
      options.subscribe({ next: () => order.push('next') });
      transport.current.handlers.next({ onBulkGenerate: snapshot() });

      expect(order).toEqual(['updateCache', 'next']);
    });
  });
});

describe('composed with useSubscription', () => {
  it('surfaces a GraphQL refusal as a GraphQLResponseError', () => {
    const { gqlSubscriptionOptions, transport } = createRpc();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useSubscription(
        gqlSubscriptionOptions(ON_PROGRESS, {
          input: { batchKey: 'batch-1' },
          onError,
        }),
      ),
    );

    act(() => {
      transport.current.handlers.next({ onBulkGenerate: snapshot() });
      // A bare `GraphQLError[]`, which is how `graphql-sse` reports a refusal.
      transport.current.handlers.error?.([
        { message: 'Forbidden', extensions: { code: 'FORBIDDEN' } },
      ]);
    });

    expect(result.current.status).toBe('error');
    const error = result.current.error;
    expect(GraphQLResponseError.is(error)).toBe(true);
    // The whole point of rebuilding it at the boundary: the generic hook would
    // have wrapped this in a plain Error, and `resolveErrorStatus` reads this.
    expect((error as GraphQLResponseError).status).toBe(403);
    expect(onError).toHaveBeenCalledWith(error);
    // The last snapshot is still the truest thing we know.
    expect(result.current.data?.onBulkGenerate.succeededCount).toBe(1);
  });

  it('writes every payload the stream delivers into the graph cache', () => {
    const cache = new InMemoryGraphCache();
    const { gqlSubscriptionOptions, transport } = createRpc(cache);

    renderHook(() =>
      useSubscription(
        gqlSubscriptionOptions(ON_PROGRESS, { input: { batchKey: 'batch-1' } }),
      ),
    );

    act(() => transport.current.handlers.next({ onBulkGenerate: snapshot() }));

    expect(
      (cache.extract() as Record<string, any>)['ROOT_SUBSCRIPTION'],
    ).toBeDefined();
  });

  it('opens nothing for a variable-less document that is disabled', () => {
    const { gqlSubscriptionOptions, transport } = createRpc();

    const { result } = renderHook(() =>
      useSubscription(gqlSubscriptionOptions(ON_TICK, { enabled: false })),
    );

    expect(result.current.status).toBe('idle');
    expect(transport.subscribe).not.toHaveBeenCalled();
  });

  it('forwards no variables at all for a variable-less document', () => {
    const { gqlSubscriptionOptions, transport } = createRpc();

    renderHook(() => useSubscription(gqlSubscriptionOptions(ON_TICK)));

    // An empty object is the KEY's shape, never the wire's.
    expect(transport.current.variables).toBeUndefined();
  });
});
