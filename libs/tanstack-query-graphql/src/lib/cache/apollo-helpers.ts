import type {
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  SelectionSetNode,
} from 'graphql';
import { Kind, parse, valueFromASTUntyped } from 'graphql';

import { GraphCache } from '../helpers';

/**
 * Parses a GraphQL query string into a DocumentNode for Apollo Cache
 */
export function parseGraphQLQuery(queryString: string): DocumentNode {
  try {
    return parse(queryString);
  } catch (error) {
    console.error('Failed to parse GraphQL query:', error);
    throw error;
  }
}

/**
 * Writes query data to Apollo Cache
 */
export function writeQueryToGraphCache<TData>(
  cache: GraphCache,
  queryString: string,
  variables: Record<string, unknown> | undefined,
  data: TData,
): void {
  try {
    const query = parseGraphQLQuery(queryString);
    cache.writeQuery({
      query,
      variables: variables ?? undefined,
      data,
    });
  } catch (error) {
    console.error('Failed to write query to Apollo cache:', error);
  }
}

/**
 * Writes a subscription payload to Apollo Cache.
 *
 * `dataId: 'ROOT_SUBSCRIPTION'` is not a detail — it is the whole difference
 * from {@link writeQueryToGraphCache}. Apollo's own `QueryManager` writes every
 * subscription result exactly this way: the *root* fields of a subscription
 * (`onBulkGeneratePetitions…`) are not query fields and must not be filed under
 * `ROOT_QUERY`, but the entities nested inside them are the same entities every
 * query holds, so normalizing the payload patches them everywhere they are
 * referenced. That is the whole point of writing at all — a subscription that
 * carries an updated `Case` refreshes every list showing that case, for free.
 */
export function writeSubscriptionToGraphCache<TData>(
  cache: GraphCache,
  queryString: string,
  variables: Record<string, unknown> | undefined,
  data: TData,
): void {
  try {
    cache.write({
      query: parseGraphQLQuery(queryString),
      dataId: 'ROOT_SUBSCRIPTION',
      result: data,
      variables: variables ?? undefined,
    });
  } catch (error) {
    console.error('Failed to write subscription to Apollo cache:', error);
  }
}

/**
 * Reads query data from Apollo Cache
 */
export function readQueryFromGraphCache<TData>(
  cache: GraphCache,
  queryString: string,
  variables: Record<string, unknown> | undefined,
): TData | null {
  try {
    const query = parseGraphQLQuery(queryString);
    return cache.readQuery<TData>({
      query,
      variables: variables ?? undefined,
    });
  } catch {
    // Apollo returns null if query is not in cache or has missing fields
    return null;
  }
}

/**
 * Evicts a query from Apollo Cache: each root field it selects, under the
 * arguments its variables resolve to — `posts(first: 6)`, not every `posts`.
 */
export function evictQueryFromGraphCache(
  cache: GraphCache,
  queryString: string,
  variables: Record<string, unknown> | undefined,
): boolean {
  try {
    const document = parseGraphQLQuery(queryString);
    const evicted = rootFieldsOf(document).map((field) =>
      cache.evict({
        id: 'ROOT_QUERY',
        fieldName: field.name.value,
        args: argumentsOf(field, variables),
      }),
    );
    return evicted.some(Boolean);
  } catch (error) {
    console.error('Failed to evict query from Apollo cache:', error);
    return false;
  }
}

function rootFieldsOf(document: DocumentNode): FieldNode[] {
  const operation = document.definitions.find(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );
  if (!operation) {
    return [];
  }

  const fragments = new Map(
    document.definitions
      .filter(
        (definition): definition is FragmentDefinitionNode =>
          definition.kind === Kind.FRAGMENT_DEFINITION,
      )
      .map((fragment) => [fragment.name.value, fragment.selectionSet]),
  );

  const fieldsIn = (selectionSet: SelectionSetNode): FieldNode[] =>
    selectionSet.selections.flatMap((selection) => {
      if (selection.kind === Kind.FIELD) {
        return [selection];
      }
      if (selection.kind === Kind.INLINE_FRAGMENT) {
        return fieldsIn(selection.selectionSet);
      }
      const spread = fragments.get(selection.name.value);
      return spread ? fieldsIn(spread) : [];
    });

  return fieldsIn(operation.selectionSet);
}

function argumentsOf(
  field: FieldNode,
  variables: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!field.arguments?.length) {
    return undefined;
  }
  return Object.fromEntries(
    field.arguments.map((argument) => [
      argument.name.value,
      valueFromASTUntyped(argument.value, variables),
    ]),
  );
}

/**
 * Checks if a query key is a GraphQL query key
 */
export function isGraphQLQueryKey(
  queryKey: readonly unknown[],
): queryKey is readonly ['graph', string, Record<string, unknown>] {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 3 &&
    queryKey[0] === 'graph' &&
    typeof queryKey[1] === 'string' &&
    (typeof queryKey[2] === 'object' || queryKey[2] === undefined)
  );
}

/**
 * Checks if a mutation key is a GraphQL mutation key
 */
export function isGraphQLMutationKey(
  mutationKey: readonly unknown[] | undefined,
): mutationKey is readonly ['graph', string] {
  return (
    Array.isArray(mutationKey) &&
    mutationKey.length === 2 &&
    mutationKey[0] === 'graph' &&
    typeof mutationKey[1] === 'string'
  );
}

/**
 * Checks if a key is a GraphQL subscription key
 *
 * Nothing mirrors these into Apollo — `GqlRpc` writes the payload itself, under
 * `ROOT_SUBSCRIPTION`. The guard exists so a subscription key can be told apart
 * from a query one by anything walking the React Query cache.
 */
export function isGraphQLSubscriptionKey(
  queryKey: readonly unknown[] | undefined,
): queryKey is readonly [
  'graph',
  'subscription',
  string,
  Record<string, unknown>,
] {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 4 &&
    queryKey[0] === 'graph' &&
    queryKey[1] === 'subscription' &&
    typeof queryKey[2] === 'string'
  );
}
