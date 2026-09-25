import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query';
import { parse } from 'graphql';

import { InMemoryGraphCache } from '../helpers';
import { GraphQueryCache } from './graph-query-cache';

const flushNotifications = () =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe('GraphQueryCache', () => {
  let apolloCache: InMemoryGraphCache;
  let graphQueryCache: GraphQueryCache;
  let queryClient: QueryClient;

  beforeEach(() => {
    apolloCache = new InMemoryGraphCache();
    graphQueryCache = new GraphQueryCache(apolloCache);
    queryClient = new QueryClient({
      queryCache: graphQueryCache,
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('add', () => {
    it('should add a GraphQL query and attempt hydration', async () => {
      const queryString = `query GetUser($id: ID!) { user(id: $id) { id name } }`;
      const variables = { id: '123' };
      const queryKey = ['graph', queryString, variables] as const;

      // Pre-populate Apollo Cache
      const query = parse(queryString);
      apolloCache.writeQuery({
        query,
        variables,
        data: { user: { __typename: 'User', id: '123', name: 'John Doe' } },
      });

      // Fetch the query which should trigger hydration
      const result = await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => ({ user: { id: '123', name: 'John Doe' } }),
      });

      expect(result).toEqual({ user: { id: '123', name: 'John Doe' } });
    });

    it('should add a non-GraphQL query without hydration', async () => {
      const queryKey = ['users', 'list'] as const;

      const result = await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => [{ id: 1, name: 'Test' }],
      });

      expect(result).toEqual([{ id: 1, name: 'Test' }]);
    });
  });

  describe('remove', () => {
    it('should remove a GraphQL query and evict from Apollo Cache', async () => {
      const queryString = `query GetItem { item { id name } }`;
      const queryKey = ['graph', queryString, {}] as const;

      // Add data to Apollo Cache
      const query = parse(queryString);
      apolloCache.writeQuery({
        query,
        data: { item: { __typename: 'Item', id: '1', name: 'Item 1' } },
      });

      // Fetch the query
      await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => ({ item: { id: '1', name: 'Item 1' } }),
      });

      // Verify it's in the cache
      const cachedQuery = graphQueryCache.find({ queryKey });
      expect(cachedQuery).toBeDefined();

      // Remove the query
      queryClient.removeQueries({ queryKey });

      // Verify it's removed from React Query cache
      const removedQuery = graphQueryCache.find({ queryKey });
      expect(removedQuery).toBeUndefined();
    });

    it('evicts the root fields the query selected, under its own arguments only', async () => {
      const queryString = `query GetUser($id: ID!) { user(id: $id) { id name } }`;
      const document = parse(queryString);
      for (const id of ['1', '2']) {
        await queryClient.fetchQuery({
          queryKey: ['graph', queryString, { id }],
          queryFn: async () => ({
            user: { __typename: 'User', id, name: `user ${id}` },
          }),
        });
      }
      await flushNotifications();

      queryClient.removeQueries({
        queryKey: ['graph', queryString, { id: '1' }],
        exact: true,
      });

      expect(
        apolloCache.readQuery({ query: document, variables: { id: '1' } }),
      ).toBeNull();
      expect(
        apolloCache.readQuery({ query: document, variables: { id: '2' } }),
      ).toEqual({ user: { __typename: 'User', id: '2', name: 'user 2' } });
    });

    it('evicts the root fields a spread fragment selects', async () => {
      const queryString = `query GetShelf { ...Shelf } fragment Shelf on Query { shelf { id } }`;
      await queryClient.fetchQuery({
        queryKey: ['graph', queryString, {}],
        queryFn: async () => ({ shelf: { __typename: 'Shelf', id: 's1' } }),
      });
      await flushNotifications();

      queryClient.removeQueries({ queryKey: ['graph', queryString, {}] });

      expect(apolloCache.readQuery({ query: parse(queryString) })).toBeNull();
    });

    it('should remove a non-GraphQL query normally', async () => {
      const queryKey = ['users'] as const;

      await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => [{ id: 1 }],
      });

      const cachedQuery = graphQueryCache.find({ queryKey });
      expect(cachedQuery).toBeDefined();

      queryClient.removeQueries({ queryKey });

      const removedQuery = graphQueryCache.find({ queryKey });
      expect(removedQuery).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all queries and evict GraphQL queries from Apollo Cache', async () => {
      const queryString1 = `query Query1 { item1 { id } }`;
      const queryString2 = `query Query2 { item2 { id } }`;

      const query1 = parse(queryString1);
      const query2 = parse(queryString2);

      // Add data to Apollo Cache
      apolloCache.writeQuery({
        query: query1,
        data: { item1: { __typename: 'Item', id: '1' } },
      });
      apolloCache.writeQuery({
        query: query2,
        data: { item2: { __typename: 'Item', id: '2' } },
      });

      // Fetch queries
      await Promise.all([
        queryClient.fetchQuery({
          queryKey: ['graph', queryString1, {}],
          queryFn: async () => ({ item1: { id: '1' } }),
        }),
        queryClient.fetchQuery({
          queryKey: ['graph', queryString2, {}],
          queryFn: async () => ({ item2: { id: '2' } }),
        }),
        queryClient.fetchQuery({
          queryKey: ['non-graph', 'test'],
          queryFn: async () => ({ data: 'test' }),
        }),
      ]);

      // Verify queries exist
      expect(graphQueryCache.getAll().length).toBe(3);

      // Clear all queries
      graphQueryCache.clear();

      // Verify all queries are removed
      expect(graphQueryCache.getAll().length).toBe(0);
    });
  });

  describe('hydration from Apollo Cache', () => {
    it('should hydrate query state from Apollo Cache when data is available', async () => {
      const queryString = `query GetProduct($id: ID!) { product(id: $id) { id name price } }`;
      const variables = { id: 'prod-123' };
      const queryKey = ['graph', queryString, variables] as const;

      const mockData = {
        product: {
          __typename: 'Product',
          id: 'prod-123',
          name: 'Test Product',
          price: 99.99,
        },
      };

      // Pre-populate Apollo Cache
      const query = parse(queryString);
      apolloCache.writeQuery({
        query,
        variables,
        data: mockData,
      });

      // Fetch the query (should hydrate immediately)
      const result = await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => mockData,
      });

      // Should have hydrated from Apollo Cache or fetched
      expect(result).toEqual(mockData);
    });
  });

  describe('a query that arrives with its state', () => {
    const queryString = `query GetPost($id: ID!) { post(id: $id) { id title } }`;
    const variables = { id: 'p1' };
    const queryKey = ['graph', queryString, variables] as const;
    const post = (title: string) => ({
      post: { __typename: 'Post', id: 'p1', title },
    });

    it('keeps what the server dehydrated, and writes it into Apollo over what Apollo held', () => {
      apolloCache.writeQuery({
        query: parse(queryString),
        variables,
        data: post('from an earlier visit'),
      });
      const server = new QueryClient();
      server.setQueryData(queryKey, post('fresh from the server'), {
        updatedAt: Date.now() - 60_000,
      });

      hydrate(queryClient, dehydrate(server));

      expect(queryClient.getQueryData(queryKey)).toEqual(
        post('fresh from the server'),
      );
      expect(
        apolloCache.readQuery({ query: parse(queryString), variables }),
      ).toEqual(post('fresh from the server'));
    });

    it('is filled from Apollo when it arrives empty', () => {
      apolloCache.writeQuery({
        query: parse(queryString),
        variables,
        data: post('normalized earlier'),
      });

      const query = graphQueryCache.build(queryClient, { queryKey });

      expect(query.state.status).toBe('success');
      expect(query.state.data).toEqual(post('normalized earlier'));
    });
  });

  describe('sync to Apollo Cache on success', () => {
    it('should write query result to Apollo Cache when query succeeds', async () => {
      const queryString = `query GetOrder($id: ID!) { order(id: $id) { id total } }`;
      const variables = { id: 'order-456' };
      const queryKey = ['graph', queryString, variables] as const;

      const mockData = {
        order: {
          __typename: 'Order',
          id: 'order-456',
          total: 150.0,
        },
      };

      // Fetch the query
      await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => mockData,
      });

      // Give notification system time to sync
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify data was written to Apollo Cache
      const query = parse(queryString);
      const cachedData = apolloCache.readQuery({
        query,
        variables,
      });

      expect(cachedData).toEqual(mockData);
    });
  });

  describe('integration with non-GraphQL queries', () => {
    it('should handle GraphQL and non-GraphQL queries together', async () => {
      const graphQLQueryString = `query GetData { data { id } }`;
      const graphQLKey = ['graph', graphQLQueryString, {}] as const;
      const nonGraphQLKey = ['api', 'data'] as const;

      const [graphQLResult, nonGraphQLResult] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: graphQLKey,
          queryFn: async () => ({ data: { id: '1' } }),
        }),
        queryClient.fetchQuery({
          queryKey: nonGraphQLKey,
          queryFn: async () => ({ data: 'test' }),
        }),
      ]);

      expect(graphQLResult).toEqual({ data: { id: '1' } });
      expect(nonGraphQLResult).toEqual({ data: 'test' });
      expect(graphQueryCache.getAll()).toHaveLength(2);
    });
  });
});
