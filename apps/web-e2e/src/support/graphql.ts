import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { print } from 'graphql';

export interface GraphQlAnswer<TResult> {
  data?: TResult | null;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export type OperationVariables<TVariables> =
  TVariables extends Record<string, never> ? [] : [variables: TVariables];

export interface GraphQlTransport {
  (query: string, variables: Record<string, unknown>): Promise<unknown>;
}

export interface ExecuteGraphql {
  <TResult, TVariables>(
    document: TypedDocumentNode<TResult, TVariables>,
    ...[variables]: OperationVariables<TVariables>
  ): Promise<GraphQlAnswer<TResult>>;
}

/**
 * Turns a way of sending a GraphQL request into the typed `executeGraphql` the specs call.
 *
 * The document is a `TypedDocumentNode` that codegen built from the SDL, so it carries both the
 * result and the variables of the operation: what comes back is typed without a spec saying so, and
 * an operation with no variables refuses the second argument instead of ignoring it.
 */
export const graphqlExecutor =
  (send: GraphQlTransport): ExecuteGraphql =>
  <TResult, TVariables>(
    document: TypedDocumentNode<TResult, TVariables>,
    ...[variables]: OperationVariables<TVariables>
  ): Promise<GraphQlAnswer<TResult>> =>
    send(
      print(document),
      (variables ?? {}) as Record<string, unknown>,
    ) as Promise<GraphQlAnswer<TResult>>;
