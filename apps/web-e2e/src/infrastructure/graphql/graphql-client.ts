import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { Page } from '@playwright/test';
import { print } from 'graphql';

export interface GraphqlAnswer<TResult> {
  data?: TResult | null;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export type OperationVariables<TVariables> =
  TVariables extends Record<string, never> ? [] : [variables: TVariables];

type GraphqlTransport = (
  query: string,
  variables: Record<string, unknown>,
) => Promise<unknown>;

/**
 * GraphQL executed with a document that `graphql()` built from the SDL, not a string: the schema is
 * the one the API serves, so a field that does not exist is a compile error here, and the answer is
 * typed without a spec having to say what it is. An operation with no variables refuses the second
 * argument instead of ignoring it.
 */
export class GraphqlClient {
  private constructor(private readonly send: GraphqlTransport) {}

  /**
   * GraphQL **as the browser asks it**: through `/api/graphql`, the proxy that puts this request's
   * cookie and its `x-tenant` on the way out. It is how the page itself queries, so what it proves is
   * what a user gets — not what a script with a hand-built header gets.
   *
   * The `goto` is not ceremony: a relative URL has no base until the page has navigated somewhere,
   * and a test that only reads durable state never navigates.
   */
  static throughBrowser(page: Page): GraphqlClient {
    return new GraphqlClient(async (query, variables) => {
      if (!page.url().startsWith('http')) {
        await page.goto('/');
      }
      return page.evaluate(
        async ([document, args]) => {
          const response = await fetch('/api/graphql', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: document, variables: args }),
          });
          return response.json();
        },
        [query, variables] as const,
      );
    });
  }

  static at(url: string, headers: Record<string, string> = {}): GraphqlClient {
    return new GraphqlClient(async (query, variables) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ query, variables }),
      });
      return response.json();
    });
  }

  execute<TResult, TVariables>(
    document: TypedDocumentNode<TResult, TVariables>,
    ...[variables]: OperationVariables<TVariables>
  ): Promise<GraphqlAnswer<TResult>> {
    return this.send(
      print(document),
      (variables ?? {}) as Record<string, unknown>,
    ) as Promise<GraphqlAnswer<TResult>>;
  }

  async data<TResult, TVariables>(
    document: TypedDocumentNode<TResult, TVariables>,
    ...variables: OperationVariables<TVariables>
  ): Promise<TResult> {
    const answer = await this.execute(document, ...variables);
    if (answer.errors || !answer.data) {
      throw new Error(JSON.stringify(answer.errors ?? answer));
    }
    return answer.data;
  }
}
