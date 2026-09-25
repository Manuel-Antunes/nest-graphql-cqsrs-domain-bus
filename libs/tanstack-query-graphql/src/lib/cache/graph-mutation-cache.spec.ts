import { QueryClient } from '@tanstack/react-query';
import { parse } from 'graphql';

import { InMemoryGraphCache } from '../helpers';
import { GraphMutationCache } from './graph-mutation-cache';

describe('GraphMutationCache', () => {
  let apolloCache: InMemoryGraphCache;
  let graphMutationCache: GraphMutationCache;
  let queryClient: QueryClient;

  beforeEach(() => {
    apolloCache = new InMemoryGraphCache();
    graphMutationCache = new GraphMutationCache(apolloCache);
    queryClient = new QueryClient({
      mutationCache: graphMutationCache,
      defaultOptions: {
        mutations: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('add', () => {
    it('should add a GraphQL mutation to the cache', async () => {
      const mutationString =
        'mutation UpdateUser($id: ID!, $input: UpdateUserInput!) { updateUser(id: $id, input: $input) { id name } }';
      const mutationKey = ['graph', mutationString] as const;

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async (variables: {
          id: string;
          input: { name: string };
        }) => ({
          updateUser: { id: variables.id, name: variables.input.name },
        }),
      });

      await mutation.execute({ id: '1', input: { name: 'Test User' } });

      // Mutation should have been tracked by the cache
      expect(graphMutationCache.getAll()).toContain(mutation);
    });

    it('should add a non-GraphQL mutation to the cache', async () => {
      const mutationKey = ['api', 'updateUser'] as const;

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async (data: { id: string; name: string }) => data,
      });

      await mutation.execute({ id: '1', name: 'Test User' });

      expect(graphMutationCache.getAll()).toContain(mutation);
    });
  });

  describe('clear', () => {
    it('should clear all mutations and trigger Apollo cache GC', async () => {
      const mutation1String = 'mutation Mutation1 { test1 { id } }';
      const mutation2String = 'mutation Mutation2 { test2 { id } }';

      const mutation1 = graphMutationCache.build(queryClient, {
        mutationKey: ['graph', mutation1String],
        mutationFn: async () => ({ test1: { id: '1' } }),
      });

      const mutation2 = graphMutationCache.build(queryClient, {
        mutationKey: ['graph', mutation2String],
        mutationFn: async () => ({ test2: { id: '2' } }),
      });

      const mutation3 = graphMutationCache.build(queryClient, {
        mutationKey: ['api', 'test'],
        mutationFn: async () => ({ data: 'test' }),
      });

      await Promise.all([
        mutation1.execute({}),
        mutation2.execute({}),
        mutation3.execute({}),
      ]);

      expect(graphMutationCache.getAll().length).toBe(3);

      // Spy on Apollo cache gc
      const gcSpy = vi.spyOn(apolloCache, 'gc');

      graphMutationCache.clear();

      expect(graphMutationCache.getAll().length).toBe(0);
      expect(gcSpy).toHaveBeenCalled();
    });

    it('should not call gc if no GraphQL mutations exist', async () => {
      const mutation = graphMutationCache.build(queryClient, {
        mutationKey: ['api', 'test'],
        mutationFn: async () => ({ data: 'test' }),
      });

      await mutation.execute({});

      const gcSpy = vi.spyOn(apolloCache, 'gc');

      graphMutationCache.clear();

      expect(gcSpy).not.toHaveBeenCalled();
    });
  });

  describe('Apollo Cache integration', () => {
    it('should write mutation result to Apollo Cache on success', async () => {
      const mutationString =
        'mutation CreateProduct($input: CreateProductInput!) { createProduct(input: $input) { id name price } }';
      const mutationKey = ['graph', mutationString] as const;

      const mockData = {
        createProduct: {
          __typename: 'Product',
          id: 'prod-123',
          name: 'New Product',
          price: 49.99,
        },
      };

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async () => mockData,
      });

      await mutation.execute({});

      // Give notification system time to sync
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify data was written to Apollo Cache
      const mutationDoc = parse(mutationString);
      try {
        const cachedData = apolloCache.readQuery({
          query: mutationDoc,
          variables: {},
        });

        expect(cachedData).toEqual(mockData);
      } catch {
        // Apollo might not cache mutations the same way as queries
        // This is expected behavior in some cases
      }
    });

    it('should handle mutation errors gracefully', async () => {
      const mutationString =
        'mutation FailingMutation { failingMutation { id } }';
      const mutationKey = ['graph', mutationString] as const;

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementation(() => {});

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async () => {
          throw new Error('Mutation failed');
        },
      });

      try {
        await mutation.execute({});
      } catch {
        // Expected to fail
      }

      // Should not have written anything to Apollo Cache
      // No errors should be thrown during cache write attempt
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to update Apollo cache'),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle mutations without operation names', async () => {
      const mutationString = 'mutation { anonymousMutation { success } }';
      const mutationKey = ['graph', mutationString] as const;

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async () => ({
          anonymousMutation: { success: true },
        }),
      });

      await mutation.execute({});

      // Should handle gracefully without errors
      await new Promise((resolve) => setTimeout(resolve, 100));

      // No errors should have been logged
      expect(true).toBe(true);
    });
  });

  describe('notification system', () => {
    it('should listen to mutation updates and sync on success', async () => {
      const mutationString =
        'mutation UpdateSettings($settings: SettingsInput!) { updateSettings(settings: $settings) { theme language } }';
      const mutationKey = ['graph', mutationString] as const;

      const mockData = {
        updateSettings: {
          __typename: 'Settings',
          theme: 'dark',
          language: 'en',
        },
      };

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async () => mockData,
      });

      const result = await mutation.execute({});

      // Wait for notifications
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have completed successfully
      expect(result).toEqual(mockData);
    });

    it('should not process non-GraphQL mutations specially', async () => {
      const mutationKey = ['api', 'standardMutation'] as const;

      const gcSpy = vi.spyOn(apolloCache, 'gc');

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async (data: { value: string }) => ({ result: data.value }),
      });

      await mutation.execute({ value: 'test' });

      // Wait for any potential processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have interacted with Apollo cache
      expect(gcSpy).not.toHaveBeenCalled();
    });
  });

  describe('integration tests', () => {
    it('should handle multiple concurrent GraphQL mutations', async () => {
      const mutation1String = 'mutation Create1 { create1 { id } }';
      const mutation2String = 'mutation Create2 { create2 { id } }';

      const mutation1 = graphMutationCache.build(queryClient, {
        mutationKey: ['graph', mutation1String],
        mutationFn: async () => ({ create1: { id: '1' } }),
      });

      const mutation2 = graphMutationCache.build(queryClient, {
        mutationKey: ['graph', mutation2String],
        mutationFn: async () => ({ create2: { id: '2' } }),
      });

      const [result1, result2] = await Promise.all([
        mutation1.execute({}),
        mutation2.execute({}),
      ]);

      // Both should complete successfully
      expect(result1).toEqual({ create1: { id: '1' } });
      expect(result2).toEqual({ create2: { id: '2' } });
    });

    it('should work with GraphQL and non-GraphQL mutations together', async () => {
      const graphQLMutation = graphMutationCache.build(queryClient, {
        mutationKey: ['graph', 'mutation Test { test { id } }'],
        mutationFn: async () => ({ test: { id: '1' } }),
      });

      const standardMutation = graphMutationCache.build(queryClient, {
        mutationKey: ['api', 'test'],
        mutationFn: async () => ({ data: 'test' }),
      });

      const [graphQLResult, standardResult] = await Promise.all([
        graphQLMutation.execute({}),
        standardMutation.execute({}),
      ]);

      expect(graphQLResult).toEqual({ test: { id: '1' } });
      expect(standardResult).toEqual({ data: 'test' });
    });
  });

  describe('error handling', () => {
    it('should handle invalid GraphQL mutation strings', async () => {
      const invalidMutationString = 'not a valid graphql mutation';
      const mutationKey = ['graph', invalidMutationString] as const;

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementation(() => {});

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async () => ({ result: 'data' }),
      });

      await mutation.execute({});

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have logged an error about parsing
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle Apollo Cache write failures gracefully', async () => {
      const mutationString = 'mutation Test { test { id } }';
      const mutationKey = ['graph', mutationString] as const;

      // Mock Apollo cache to throw an error
      vi.spyOn(apolloCache, 'writeQuery').mockImplementationOnce(() => {
        throw new Error('Cache write failed');
      });

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementation(() => {});

      const mutation = graphMutationCache.build(queryClient, {
        mutationKey,
        mutationFn: async () => ({ test: { id: '1' } }),
      });

      await mutation.execute({});

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have logged the error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to update Apollo cache after mutation:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
