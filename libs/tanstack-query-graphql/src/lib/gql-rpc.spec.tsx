/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GqlRpc } from './gql-rpc';
import { InMemoryGraphCache } from './helpers';
import { TypedDocumentString } from './types';

/** Codegen documents are `String` subclasses; these tests only need `toString`. */
function doc<TResult, TVariables>(
  source: string,
): TypedDocumentString<TResult, TVariables> {
  return { toString: () => source } as TypedDocumentString<TResult, TVariables>;
}

const execute = vi.fn();
const rpc = new GqlRpc(execute, new InMemoryGraphCache());
const gqlQueryOptions = rpc.gqlQueryOptions.bind(rpc);
const gqlInfiniteOptions = rpc.gqlInfiniteOptions.bind(rpc);
const gqlMutationOptions = rpc.gqlMutationOptions.bind(rpc);

/** v5 hands `mutationFn` a `MutationFunctionContext` as its second argument. */
const mutationContext = {
  client: new QueryClient(),
  meta: undefined,
  mutationKey: undefined,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('GqlRpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('gqlQueryOptions', () => {
    const mockQuery = doc<
      { user: { id: string; name: string } },
      { id: string }
    >('query GetUser($id: ID!) { user(id: $id) { id name } }');

    it('takes the variables from the document, so one whose variables are all optional accepts an empty input', () => {
      const optionalOnly = doc<
        { posts: { id: string }[] },
        { first?: number | null }
      >('query Posts($first: Int) { posts(first: $first) { id } }');

      const options = gqlQueryOptions(optionalOnly, { input: {} });

      expect(options.queryKey[2]).toEqual({});
    });

    it('should create correct query options with input', () => {
      const options = gqlQueryOptions(mockQuery, {
        input: { id: '123' },
      });

      expect(options.queryKey).toEqual([
        'graph',
        'query GetUser($id: ID!) { user(id: $id) { id name } }',
        { id: '123' },
      ]);
      expect(options.queryFn).toBeDefined();
    });

    it('should execute query with correct variables', async () => {
      const mockData = { user: { id: '123', name: 'John' } };
      execute.mockResolvedValue(mockData);

      const options = gqlQueryOptions(mockQuery, {
        input: { id: '123' },
      });

      const result = await options.queryFn?.({} as any);
      expect(result).toEqual(mockData);
      expect(execute).toHaveBeenCalledWith(mockQuery, { id: '123' });
    });

    it('should work with useQuery hook', async () => {
      const mockData = { user: { id: '123', name: 'John' } };
      execute.mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useQuery(gqlQueryOptions(mockQuery, { input: { id: '123' } })),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockData);
    });

    it('should handle queries without variables', () => {
      const mockQueryNoVars = doc<
        { users: Array<{ id: string; name: string }> },
        Record<string, never>
      >('query GetAllUsers { users { id name } }');

      const options = gqlQueryOptions(mockQueryNoVars);

      expect(options.queryKey).toEqual([
        'graph',
        'query GetAllUsers { users { id name } }',
        {},
      ]);
    });

    it('omits the variables argument entirely when the operation has none', async () => {
      const mockQueryNoVars = doc<
        { users: Array<{ id: string }> },
        Record<string, never>
      >('query GetAllUsers { users { id } }');
      execute.mockResolvedValue({ users: [] });

      await gqlQueryOptions(mockQueryNoVars).queryFn?.({} as any);

      expect(execute).toHaveBeenCalledWith(mockQueryNoVars);
    });

    it('should pass through additional React Query options', () => {
      const options = gqlQueryOptions(mockQuery, {
        input: { id: '123' },
        staleTime: 5000,
        enabled: false,
      });

      expect(options.staleTime).toBe(5000);
      expect(options.enabled).toBe(false);
    });
  });

  describe('gqlMutationOptions', () => {
    const mockMutation = doc<
      { createUser: { id: string; name: string } },
      { name: string }
    >(
      'mutation CreateUser($name: String!) { createUser(name: $name) { id name } }',
    );

    it('should create correct mutation options', () => {
      const options = gqlMutationOptions(mockMutation);

      expect(options.mutationKey).toEqual([
        'graph',
        'mutation CreateUser($name: String!) { createUser(name: $name) { id name } }',
      ]);
      expect(options.mutationFn).toBeDefined();
    });

    it('should execute mutation with correct variables', async () => {
      const mockData = { createUser: { id: '456', name: 'Jane' } };
      execute.mockResolvedValue(mockData);

      const options = gqlMutationOptions(mockMutation);
      const result = await options.mutationFn?.(
        { name: 'Jane' },
        mutationContext,
      );

      expect(result).toEqual(mockData);
      expect(execute).toHaveBeenCalledWith(mockMutation, { name: 'Jane' });
    });

    it('should work with useMutation hook', async () => {
      const mockData = { createUser: { id: '456', name: 'Jane' } };
      execute.mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useMutation(gqlMutationOptions(mockMutation)),
        { wrapper: createWrapper() },
      );

      result.current.mutate({ name: 'Jane' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockData);
    });

    it('should pass through mutation callbacks', () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();

      const options = gqlMutationOptions(mockMutation, {
        onSuccess,
        onError,
      });

      // `onError` is forwarded untouched. `onSuccess` is wrapped, because
      // `updateCache` has to run against Apollo before the caller's handler —
      // so assert delegation rather than identity. See `cache/update-cache.spec.tsx`.
      expect(options.onError).toBe(onError);
      expect(options.onSuccess).not.toBe(onSuccess);

      const data = { createUser: { id: '456', name: 'Jane' } };
      options.onSuccess?.(data, { name: 'Jane' }, undefined, {} as any);

      expect(onSuccess).toHaveBeenCalledWith(
        data,
        { name: 'Jane' },
        undefined,
        {},
      );
    });
  });

  describe('gqlInfiniteOptions', () => {
    interface WellsData {
      wells: {
        items: Array<{ id: string; name: string }>;
        currentPage: number;
        lastPage: number;
      };
    }

    interface WellsVariables {
      page: number;
      perPage: number;
    }

    const mockInfiniteQuery = doc<WellsData, WellsVariables>(
      'query GetWells($page: Int!, $perPage: Int!) { wells(page: $page, perPage: $perPage) { items { id name } currentPage lastPage } }',
    );

    it('should create correct infinite query options', () => {
      const options = gqlInfiniteOptions(mockInfiniteQuery, {
        input: (pageParam) => ({ page: pageParam, perPage: 10 }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
          if (lastPage.wells.currentPage < lastPage.wells.lastPage) {
            return lastPage.wells.currentPage + 1;
          }
          return undefined;
        },
      });

      expect(options.queryKey).toEqual([
        'graph',
        'query GetWells($page: Int!, $perPage: Int!) { wells(page: $page, perPage: $perPage) { items { id name } currentPage lastPage } }',
      ]);
      expect(options.queryFn).toBeDefined();
      expect(options.initialPageParam).toBe(1);
      expect(options.getNextPageParam).toBeDefined();
    });

    it('should execute with correct page parameters', async () => {
      const mockData: WellsData = {
        wells: {
          items: [
            { id: '1', name: 'Well 1' },
            { id: '2', name: 'Well 2' },
          ],
          currentPage: 1,
          lastPage: 3,
        },
      };
      execute.mockResolvedValue(mockData);

      const options = gqlInfiniteOptions(mockInfiniteQuery, {
        input: (pageParam) => ({ page: pageParam, perPage: 10 }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
          if (lastPage.wells.currentPage < lastPage.wells.lastPage) {
            return lastPage.wells.currentPage + 1;
          }
          return undefined;
        },
      });

      const result = await options.queryFn?.({ pageParam: 2 } as any);

      expect(result).toEqual(mockData);
      expect(execute).toHaveBeenCalledWith(mockInfiniteQuery, {
        page: 2,
        perPage: 10,
      });
    });

    it('should work with useInfiniteQuery hook', async () => {
      const mockPage1: WellsData = {
        wells: {
          items: [
            { id: '1', name: 'Well 1' },
            { id: '2', name: 'Well 2' },
          ],
          currentPage: 1,
          lastPage: 3,
        },
      };

      const mockPage2: WellsData = {
        wells: {
          items: [
            { id: '3', name: 'Well 3' },
            { id: '4', name: 'Well 4' },
          ],
          currentPage: 2,
          lastPage: 3,
        },
      };

      execute.mockResolvedValueOnce(mockPage1).mockResolvedValueOnce(mockPage2);

      const { result } = renderHook(
        () =>
          useInfiniteQuery(
            gqlInfiniteOptions(mockInfiniteQuery, {
              input: (pageParam) => ({ page: pageParam, perPage: 2 }),
              initialPageParam: 1,
              getNextPageParam: (lastPage) => {
                if (lastPage.wells.currentPage < lastPage.wells.lastPage) {
                  return lastPage.wells.currentPage + 1;
                }
                return undefined;
              },
            }),
          ),
        { wrapper: createWrapper() },
      );

      // Wait for first page
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.pages).toHaveLength(1);
      expect(result.current.data?.pages[0]).toEqual(mockPage1);
      expect(result.current.hasNextPage).toBe(true);

      // Fetch next page
      result.current.fetchNextPage();

      await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
      expect(result.current.data?.pages[1]).toEqual(mockPage2);
    });

    it('should support custom page param types', async () => {
      interface CursorData {
        items: Array<{ id: string }>;
        nextCursor: string | null;
      }

      interface CursorVariables {
        cursor: string;
      }

      const mockCursorQuery = doc<CursorData, CursorVariables>(
        'query GetItems($cursor: String!) { items(cursor: $cursor) { id } nextCursor }',
      );

      const mockData: CursorData = {
        items: [{ id: '1' }],
        nextCursor: 'next-token',
      };
      execute.mockResolvedValue(mockData);

      const options = gqlInfiniteOptions(mockCursorQuery, {
        input: (cursor: string) => ({ cursor }),
        initialPageParam: 'initial',
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      });

      const result = await options.queryFn?.({
        pageParam: 'some-cursor',
      } as any);

      expect(result).toEqual(mockData);
      expect(execute).toHaveBeenCalledWith(mockCursorQuery, {
        cursor: 'some-cursor',
      });
    });

    it('should not include variables in query key', () => {
      const options = gqlInfiniteOptions(mockInfiniteQuery, {
        input: (pageParam) => ({ page: pageParam, perPage: 10 }),
        initialPageParam: 1,
        getNextPageParam: () => undefined,
      });

      // Query key should only have graph prefix and query string, no variables
      expect(options.queryKey).toHaveLength(2);
      expect(options.queryKey[0]).toBe('graph');
      expect(options.queryKey[1]).toContain('GetWells');
    });

    it('should pass through additional React Query options', () => {
      const options = gqlInfiniteOptions(mockInfiniteQuery, {
        input: (pageParam) => ({ page: pageParam, perPage: 10 }),
        initialPageParam: 1,
        getNextPageParam: () => undefined,
        staleTime: 10000,
        enabled: false,
      });

      expect(options.staleTime).toBe(10000);
      expect(options.enabled).toBe(false);
    });
  });

  describe('query key normalization', () => {
    it('should normalize multi-line queries to single line', () => {
      const multilineQuery = doc<any, { id: string }>(`
          query GetUser($id: ID!) {
            user(id: $id) {
              id
              name
            }
          }
        `);

      const options = gqlQueryOptions(multilineQuery, { input: { id: '123' } });

      expect(options.queryKey[1]).toBe(
        'query GetUser($id: ID!) { user(id: $id) { id name } }',
      );
    });

    it('should handle extra whitespace in queries', () => {
      const whitespaceQuery = doc<any, { id: string }>(
        'query    GetUser(  $id:  ID!  )   {  user(id: $id)  {  id   name  }  }',
      );

      const options = gqlQueryOptions(whitespaceQuery, {
        input: { id: '123' },
      });

      expect(options.queryKey[1]).toBe(
        'query GetUser( $id: ID! ) { user(id: $id) { id name } }',
      );
    });
  });
});
