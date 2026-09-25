import {
  GraphQLResponseError,
  toRequestString,
} from '@nestposts/tanstack-query-graphql';
import type { FormattedExecutionResult } from 'graphql';

import type { TypedDocumentString } from '@/gql/graphql';
import { Endpoints } from '@/lib/endpoints';

export type GraphqlEndpoint = 'gateway' | 'posts';

export interface GraphqlRequest {
  query: string;
  variables?: unknown;
}

export type GraphqlTransport = (
  endpoint: GraphqlEndpoint,
  request: GraphqlRequest,
) => Promise<Response>;

declare global {
  var $graphqlServerTransport: GraphqlTransport | undefined;
}

export const GRAPHQL_ACCEPT =
  'application/graphql-response+json, application/json';

const BROWSER_ROUTES: Record<GraphqlEndpoint, string> = {
  gateway: Endpoints.graphqlProxy,
  posts: Endpoints.postsSubgraphProxy,
};

const browserTransport: GraphqlTransport = (endpoint, request) =>
  fetch(BROWSER_ROUTES[endpoint], {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: GRAPHQL_ACCEPT },
    body: JSON.stringify(request),
  });

function transport(): GraphqlTransport {
  if (typeof window !== 'undefined') {
    return browserTransport;
  }
  if (!globalThis.$graphqlServerTransport) {
    throw new Error(
      'No server-side GraphQL transport is installed: the server code that executes an operation has to import @/lib/graphql/execute.server',
    );
  }
  return globalThis.$graphqlServerTransport;
}

async function resultOf<TResult>(response: Response): Promise<TResult> {
  const body = (await response
    .json()
    .catch(() => null)) as FormattedExecutionResult<TResult> | null;

  if (body?.errors?.length) {
    throw new GraphQLResponseError(
      body.errors,
      body.data ?? null,
      body.extensions,
    );
  }
  if (!body?.data) {
    throw new Error(
      `The GraphQL endpoint answered ${response.status} without data`,
    );
  }
  return body.data;
}

export function executorFor(endpoint: GraphqlEndpoint) {
  return async function execute<TResult, TVariables>(
    document: TypedDocumentString<TResult, TVariables>,
    ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
  ): Promise<TResult> {
    const response = await transport()(endpoint, {
      query: toRequestString(document),
      variables,
    });
    return resultOf<TResult>(response);
  };
}
