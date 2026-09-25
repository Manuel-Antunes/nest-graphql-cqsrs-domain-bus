import type { Mutation } from '@tanstack/react-query';
import { MutationCache, notifyManager } from '@tanstack/react-query';

import { GraphCache } from '../helpers';
import { isGraphQLMutationKey, parseGraphQLQuery } from './apollo-helpers';

/**
 * GraphMutationCache integrates React Query mutations with Apollo Cache.
 *
 * When a mutation key starts with "graph", this cache:
 * 1. Executes the mutation through React Query
 * 2. Updates Apollo's normalized cache on success
 * 3. Triggers cache updates for related queries
 *
 * Mutation key structure: ["graph", mutationString]
 */
export class GraphMutationCache extends MutationCache {
  constructor(
    private apolloCache: GraphCache,
    config?: ConstructorParameters<typeof MutationCache>[0],
  ) {
    super(config);

    // Set up notification listener for mutation updates
    this.subscribe(
      notifyManager.batchCalls((event) => {
        if (event?.type === 'updated' && event.mutation) {
          this.handleMutationUpdate(event.mutation);
        }
      }),
    );
  }

  /**
   * Handles mutation updates and syncs to Apollo Cache
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMutationUpdate(mutation: Mutation<any, any, any, any>): void {
    if (!isGraphQLMutationKey(mutation.options.mutationKey)) {
      return;
    }

    if (
      mutation.state.status === 'success' &&
      mutation.state.data !== undefined
    ) {
      this.handleMutationSuccess(mutation, mutation.state.data);
    }
  }

  /**
   * Override add to track GraphQL mutations
   */
  override add<
    TData = unknown,
    TError = Error,
    TVariables = unknown,
    TOnMutateResult = unknown,
  >(mutation: Mutation<TData, TError, TVariables, TOnMutateResult>): void {
    // Add to React Query cache
    super.add(mutation);
  }

  /**
   * Override remove to clean up GraphQL mutations
   */
  override remove(mutation: Mutation): void {
    // For GraphQL mutations, we don't need special cleanup
    // as they don't persist in Apollo cache like queries do
    super.remove(mutation);
  }

  /**
   * Handles successful mutations by updating Apollo Cache
   */
  private handleMutationSuccess(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutation: Mutation<any, any, any, any>,
    data: unknown,
  ): void {
    if (!isGraphQLMutationKey(mutation.options.mutationKey)) {
      return;
    }

    const [, mutationString] = mutation.options.mutationKey;

    try {
      // Parse the mutation to extract information
      const mutationDoc = parseGraphQLQuery(mutationString);
      const operationDef = mutationDoc.definitions[0];

      if (operationDef?.kind !== 'OperationDefinition') {
        return;
      }

      // Write the mutation result to Apollo Cache
      // Apollo will automatically normalize and update related queries
      this.apolloCache.writeQuery({
        query: mutationDoc,
        data,
      });

      // Note: broadcastWatches is not available in all Apollo versions
      // The cache update above should trigger updates automatically
    } catch (error) {
      console.error('Failed to update Apollo cache after mutation:', error);
    }
  }

  /**
   * Clears all mutations including GraphQL mutations from Apollo cache
   */
  override clear(): void {
    // Get all GraphQL mutations before clearing
    const graphqlMutations = this.getAll().filter((mutation) =>
      isGraphQLMutationKey(mutation.options.mutationKey),
    );

    // Note: GraphQL mutations don't persist in Apollo cache the same way queries do,
    // but we can trigger a cache reset if needed
    if (graphqlMutations.length > 0) {
      // Run garbage collection on Apollo cache
      this.apolloCache.gc();
    }

    // Clear React Query mutation cache
    super.clear();
  }
}
