/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GqlRpc } from '../gql-rpc';
import type { GraphCache, Reference } from '../helpers';
import { gql, InMemoryGraphCache } from '../helpers';
import type { TypedDocumentString } from '../types';
import { GraphMutationCache } from './graph-mutation-cache';
import { GraphQueryCache } from './graph-query-cache';

/**
 * Covers `gqlMutationOptions({ updateCache })` — the hook that lets a mutation
 * hand-edit Apollo's normalized cache, the way Apollo's own `useMutation`
 * `update` option does.
 *
 * Two layers are exercised:
 *
 * 1. **Wiring** — that `updateCache` receives the right cache and data, runs at
 *    the right moment, and composes with a caller-supplied `onSuccess`.
 * 2. **Integration** — that the classic `cache.modify` + `cache.writeFragment`
 *    recipe actually lands in Apollo and is visible to *other* queries, wired
 *    through a real `QueryClient` backed by `GraphQueryCache` /
 *    `GraphMutationCache`.
 */

/** Codegen documents are `String` subclasses; these tests only need `toString`. */
function doc<TResult, TVariables>(
  source: string,
): TypedDocumentString<TResult, TVariables> {
  return { toString: () => source } as TypedDocumentString<TResult, TVariables>;
}

/**
 * A `type` rather than an `interface` on purpose: `cache.identify` takes a
 * `StoreObject`, which needs a string index signature. TypeScript gives object
 * *type aliases* an implicit one but never gives interfaces one, so an
 * `interface` here would not compile. Codegen emits type aliases, so real call
 * sites match this.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- see above: an interface has no implicit index signature
type Todo = {
  __typename: 'Todo';
  id: string;
  text: string;
};

/** The shape `cache.modify` edits — the root fields, not the entity. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- same reason
type TodoQueryFields = { todos: Reference[] };

const GET_TODOS = doc<{ todos: Todo[] }, Record<string, never>>(
  'query GetTodos { todos { __typename id text } }',
);

/**
 * A second document selecting the same root field. Apollo stores it on the same
 * `ROOT_QUERY.todos`, so mounting this one reads whatever `GET_TODOS` and the
 * mutations left behind — that sharing is the whole point of the normalized cache.
 */
const GET_TODOS_AGAIN = doc<{ todos: Todo[] }, Record<string, never>>(
  'query GetTodosAgain { todos { __typename id text } }',
);

const ADD_TODO = doc<{ addTodo: Todo }, { text: string }>(
  'mutation AddTodo($text: String!) { addTodo(text: $text) { __typename id text } }',
);

const NEW_TODO_FRAGMENT = gql`
  fragment NewTodo on Todo {
    id
    text
  }
`;

const TODOS_QUERY_DOC = gql`
  query GetTodos {
    todos {
      __typename
      id
      text
    }
  }
`;

/** The `updateCache` recipe from the Apollo docs, ported to this lib. */
const appendTodo = (cache: GraphCache, data: { addTodo: Todo }) => {
  cache.modify<TodoQueryFields>({
    fields: {
      todos(existing = []) {
        const ref = cache.writeFragment({
          data: data.addTodo,
          fragment: NEW_TODO_FRAGMENT,
        });
        return [...existing, ref as Reference];
      },
    },
  });
};

function setup() {
  const cache = new InMemoryGraphCache();
  const execute = vi.fn();
  const rpc = new GqlRpc(execute, cache);

  const queryClient = new QueryClient({
    queryCache: new GraphQueryCache(cache),
    mutationCache: new GraphMutationCache(cache),
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    cache,
    execute,
    queryClient,
    wrapper,
    gqlQueryOptions: rpc.gqlQueryOptions.bind(rpc),
    gqlMutationOptions: rpc.gqlMutationOptions.bind(rpc),
  };
}

const readTodos = (cache: GraphCache) =>
  cache.readQuery<{ todos: Todo[] }>({ query: TODOS_QUERY_DOC });

describe('gqlMutationOptions › updateCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wiring', () => {
    it('passes the GqlRpc cache instance and the mutation result', async () => {
      const { cache, execute, gqlMutationOptions } = setup();
      const data = { addTodo: { __typename: 'Todo', id: '1', text: 'a' } };
      execute.mockResolvedValue(data);

      const updateCache = vi.fn();
      const options = gqlMutationOptions(ADD_TODO, { updateCache });

      await options.mutationFn?.({ text: 'a' } as any, {} as any);
      options.onSuccess?.(data as any, { text: 'a' }, undefined, {} as any);

      expect(updateCache).toHaveBeenCalledTimes(1);
      expect(updateCache).toHaveBeenCalledWith(cache, data);
      // Identity matters: hand-edits must land in the cache the query caches read.
      expect(updateCache.mock.calls[0][0]).toBe(cache);
    });

    it('runs updateCache before the caller-supplied onSuccess', async () => {
      const { execute, gqlMutationOptions, wrapper } = setup();
      execute.mockResolvedValue({
        addTodo: { __typename: 'Todo', id: '1', text: 'a' },
      });

      const order: string[] = [];
      const { result } = renderHook(
        () =>
          useMutation(
            gqlMutationOptions(ADD_TODO, {
              updateCache: () => void order.push('updateCache'),
              onSuccess: () => void order.push('onSuccess'),
            }),
          ),
        { wrapper },
      );

      result.current.mutate({ text: 'a' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(order).toEqual(['updateCache', 'onSuccess']);
    });

    it('forwards every argument to the caller-supplied onSuccess', async () => {
      const { execute, gqlMutationOptions, wrapper } = setup();
      const data = { addTodo: { __typename: 'Todo', id: '1', text: 'a' } };
      execute.mockResolvedValue(data);

      const onSuccess = vi.fn();
      const { result } = renderHook(
        () => useMutation(gqlMutationOptions(ADD_TODO, { onSuccess })),
        { wrapper },
      );

      result.current.mutate({ text: 'a' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(onSuccess).toHaveBeenCalledTimes(1);
      const [receivedData, variables] = onSuccess.mock.calls[0];
      expect(receivedData).toEqual(data);
      expect(variables).toEqual({ text: 'a' });
      expect(onSuccess.mock.calls[0]).toHaveLength(4);
    });

    it('does not call updateCache when the mutation fails', async () => {
      const { execute, gqlMutationOptions, wrapper } = setup();
      execute.mockRejectedValue(new Error('nope'));

      const updateCache = vi.fn();
      const { result } = renderHook(
        () => useMutation(gqlMutationOptions(ADD_TODO, { updateCache })),
        { wrapper },
      );

      result.current.mutate({ text: 'a' });
      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(updateCache).not.toHaveBeenCalled();
    });

    it('resolves normally when neither updateCache nor onSuccess is given', async () => {
      const { execute, gqlMutationOptions, wrapper } = setup();
      const data = { addTodo: { __typename: 'Todo', id: '1', text: 'a' } };
      execute.mockResolvedValue(data);

      const { result } = renderHook(
        () => useMutation(gqlMutationOptions(ADD_TODO)),
        { wrapper },
      );

      result.current.mutate({ text: 'a' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(data);
    });

    it('keeps the mutation key that the cache layer matches on', () => {
      const { gqlMutationOptions } = setup();

      const options = gqlMutationOptions(ADD_TODO, {
        updateCache: appendTodo,
      });

      expect(options.mutationKey).toEqual(['graph', ADD_TODO.toString()]);
    });

    /**
     * Documented, deliberate: `updateCache` runs inside TanStack Query's
     * `onSuccess`, so a throw there marks the mutation failed even though the
     * server call succeeded. Keep cache edits total, or wrap them in try/catch.
     */
    it('surfaces a throw inside updateCache as a mutation error', async () => {
      const { execute, gqlMutationOptions, wrapper } = setup();
      execute.mockResolvedValue({
        addTodo: { __typename: 'Todo', id: '1', text: 'a' },
      });

      const { result } = renderHook(
        () =>
          useMutation(
            gqlMutationOptions(ADD_TODO, {
              updateCache: () => {
                throw new Error('boom');
              },
            }),
          ),
        { wrapper },
      );

      result.current.mutate({ text: 'a' });
      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('boom');
    });
  });

  describe('Apollo cache integration', () => {
    it('appends to a cached list via cache.modify + writeFragment', async () => {
      const { cache, execute, gqlQueryOptions, gqlMutationOptions, wrapper } =
        setup();

      execute.mockResolvedValueOnce({
        todos: [{ __typename: 'Todo', id: '1', text: 'first' }],
      });

      const { result } = renderHook(
        () => ({
          list: useQuery(gqlQueryOptions(GET_TODOS)),
          add: useMutation(
            gqlMutationOptions(ADD_TODO, { updateCache: appendTodo }),
          ),
        }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
      expect(readTodos(cache)?.todos).toHaveLength(1);

      execute.mockResolvedValueOnce({
        addTodo: { __typename: 'Todo', id: '2', text: 'second' },
      });
      result.current.add.mutate({ text: 'second' });
      await waitFor(() => expect(result.current.add.isSuccess).toBe(true));

      expect(readTodos(cache)?.todos).toEqual([
        { __typename: 'Todo', id: '1', text: 'first' },
        { __typename: 'Todo', id: '2', text: 'second' },
      ]);
    });

    it('lets a query mounted afterwards read the appended entity without refetching', async () => {
      const { execute, gqlQueryOptions, gqlMutationOptions, wrapper } = setup();

      execute.mockResolvedValueOnce({
        todos: [{ __typename: 'Todo', id: '1', text: 'first' }],
      });

      const first = renderHook(
        () => ({
          list: useQuery(gqlQueryOptions(GET_TODOS)),
          add: useMutation(
            gqlMutationOptions(ADD_TODO, { updateCache: appendTodo }),
          ),
        }),
        { wrapper },
      );

      await waitFor(() =>
        expect(first.result.current.list.isSuccess).toBe(true),
      );

      execute.mockResolvedValueOnce({
        addTodo: { __typename: 'Todo', id: '2', text: 'second' },
      });
      first.result.current.add.mutate({ text: 'second' });
      await waitFor(() =>
        expect(first.result.current.add.isSuccess).toBe(true),
      );

      // A different document over the same root field, mounted after the
      // mutation. `GraphQueryCache` hydrates it from Apollo on `add`.
      execute.mockClear();
      const second = renderHook(
        () => useQuery(gqlQueryOptions(GET_TODOS_AGAIN)),
        {
          wrapper,
        },
      );

      await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

      expect(second.result.current.data?.todos).toEqual([
        { __typename: 'Todo', id: '1', text: 'first' },
        { __typename: 'Todo', id: '2', text: 'second' },
      ]);
      expect(execute).not.toHaveBeenCalled();
    });

    /**
     * The counterpart to the list tests: a mutation that only changes fields of
     * an entity already in the cache needs **no** `updateCache` at all.
     * `GraphMutationCache` writes every mutation result into Apollo, which
     * normalizes `Todo:1` and patches it wherever it is referenced. Reach for
     * `updateCache` when list *membership* changes, not for field updates.
     */
    it('patches an existing entity with no updateCache (GraphMutationCache auto-write)', async () => {
      const { cache, execute, gqlQueryOptions, gqlMutationOptions, wrapper } =
        setup();

      execute.mockResolvedValueOnce({
        todos: [
          { __typename: 'Todo', id: '1', text: 'first' },
          { __typename: 'Todo', id: '2', text: 'second' },
        ],
      });

      const { result } = renderHook(
        () => ({
          list: useQuery(gqlQueryOptions(GET_TODOS)),
          // Deliberately no `updateCache`.
          rename: useMutation(gqlMutationOptions(ADD_TODO)),
        }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

      execute.mockResolvedValueOnce({
        addTodo: { __typename: 'Todo', id: '1', text: 'renamed' },
      });
      result.current.rename.mutate({ text: 'renamed' });
      await waitFor(() => expect(result.current.rename.isSuccess).toBe(true));

      await waitFor(() =>
        expect(readTodos(cache)?.todos).toEqual([
          { __typename: 'Todo', id: '1', text: 'renamed' },
          { __typename: 'Todo', id: '2', text: 'second' },
        ]),
      );
    });

    it('propagates an updateCache fragment write to lists holding that entity', async () => {
      const { cache, execute, gqlQueryOptions, gqlMutationOptions, wrapper } =
        setup();

      execute.mockResolvedValueOnce({
        todos: [
          { __typename: 'Todo', id: '1', text: 'first' },
          { __typename: 'Todo', id: '2', text: 'second' },
        ],
      });

      const { result } = renderHook(
        () => ({
          list: useQuery(gqlQueryOptions(GET_TODOS)),
          rename: useMutation(
            gqlMutationOptions(ADD_TODO, {
              // Patch a *different* entity than the one the mutation returned,
              // so only `updateCache` can be responsible for the change.
              updateCache: (c) => {
                c.writeFragment({
                  data: {
                    __typename: 'Todo',
                    id: '2',
                    text: 'renamed by hand',
                  },
                  fragment: NEW_TODO_FRAGMENT,
                });
              },
            }),
          ),
        }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

      execute.mockResolvedValueOnce({
        addTodo: { __typename: 'Todo', id: '1', text: 'first' },
      });
      result.current.rename.mutate({ text: 'x' });
      await waitFor(() => expect(result.current.rename.isSuccess).toBe(true));

      expect(readTodos(cache)?.todos).toEqual([
        { __typename: 'Todo', id: '1', text: 'first' },
        { __typename: 'Todo', id: '2', text: 'renamed by hand' },
      ]);
    });

    it('removes an entity via cache.evict + gc', async () => {
      const { cache, execute, gqlQueryOptions, gqlMutationOptions, wrapper } =
        setup();

      execute.mockResolvedValueOnce({
        todos: [
          { __typename: 'Todo', id: '1', text: 'first' },
          { __typename: 'Todo', id: '2', text: 'second' },
        ],
      });

      const { result } = renderHook(
        () => ({
          list: useQuery(gqlQueryOptions(GET_TODOS)),
          remove: useMutation(
            gqlMutationOptions(ADD_TODO, {
              updateCache: (c, data) => {
                const id = c.identify(data.addTodo);
                c.modify<TodoQueryFields>({
                  fields: {
                    todos: (existing = [], { readField }) =>
                      existing.filter(
                        (ref) => readField('id', ref) !== data.addTodo.id,
                      ),
                  },
                });
                c.evict({ id });
                c.gc();
              },
            }),
          ),
        }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

      execute.mockResolvedValueOnce({
        addTodo: { __typename: 'Todo', id: '1', text: 'first' },
      });
      result.current.remove.mutate({ text: 'first' });
      await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));

      expect(readTodos(cache)?.todos).toEqual([
        { __typename: 'Todo', id: '2', text: 'second' },
      ]);
    });

    /**
     * Regression guard for a sharp edge, not an aspiration.
     *
     * `GraphQueryCache` hydrates a query from Apollo when the query is *added*;
     * it does not subscribe to Apollo. So an already-mounted `useQuery` keeps
     * the TanStack Query snapshot it fetched with, even after `updateCache`
     * rewrote the same entities in Apollo. Refreshing the mounted view is the
     * caller's job — `invalidateQueries` in `onSuccess`.
     *
     * If this test ever starts failing because the mounted list *did* update,
     * the lib grew an Apollo→TanStack subscription and the README section
     * "What `updateCache` does not do" should be deleted along with it.
     */
    it('does not refresh an already-mounted query (invalidate for that)', async () => {
      const {
        cache,
        execute,
        queryClient,
        gqlQueryOptions,
        gqlMutationOptions,
        wrapper,
      } = setup();

      execute.mockResolvedValueOnce({
        todos: [{ __typename: 'Todo', id: '1', text: 'first' }],
      });

      const { result } = renderHook(
        () => ({
          list: useQuery(gqlQueryOptions(GET_TODOS)),
          add: useMutation(
            gqlMutationOptions(ADD_TODO, { updateCache: appendTodo }),
          ),
        }),
        { wrapper },
      );

      await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

      execute.mockResolvedValueOnce({
        addTodo: { __typename: 'Todo', id: '2', text: 'second' },
      });
      result.current.add.mutate({ text: 'second' });
      await waitFor(() => expect(result.current.add.isSuccess).toBe(true));

      // Apollo has both...
      expect(readTodos(cache)?.todos).toHaveLength(2);
      // ...the mounted observer still has one.
      expect(result.current.list.data?.todos).toHaveLength(1);

      // The documented way to close the gap.
      execute.mockResolvedValueOnce({
        todos: [
          { __typename: 'Todo', id: '1', text: 'first' },
          { __typename: 'Todo', id: '2', text: 'second' },
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ['graph', GET_TODOS.toString()],
      });

      await waitFor(() =>
        expect(result.current.list.data?.todos).toHaveLength(2),
      );
    });
  });

  describe('cache identity', () => {
    it('uses the cache handed to the constructor, not a fresh one per call', async () => {
      const cache = new InMemoryGraphCache();
      const execute = vi.fn();
      const rpc = new GqlRpc(execute, cache);
      const seen: GraphCache[] = [];

      const options = rpc.gqlMutationOptions(ADD_TODO, {
        updateCache: (c) => void seen.push(c),
      });

      const data = { addTodo: { __typename: 'Todo', id: '1', text: 'a' } };
      options.onSuccess?.(data as any, { text: 'a' }, undefined, {} as any);
      options.onSuccess?.(data as any, { text: 'a' }, undefined, {} as any);

      expect(seen).toEqual([cache, cache]);
    });
  });
});
