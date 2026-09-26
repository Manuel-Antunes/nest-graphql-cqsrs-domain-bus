import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import type { RunEnvironment } from '../../environment/run-environment';
import { GraphqlClient } from './graphql-client';
import { SseSubscription } from './sse-subscription';

export class GraphqlEndpoints {
  private readonly subscriptions: SseSubscription<unknown>[] = [];

  constructor(private readonly environment: RunEnvironment) {}

  postsApi(headers: Record<string, string> = {}): GraphqlClient {
    return GraphqlClient.at(`${this.environment.apiUrl}/graphql`, headers);
  }

  gateway(headers: Record<string, string> = {}): GraphqlClient {
    return GraphqlClient.at(this.environment.gatewayUrl, headers);
  }

  subscribeAtGateway<TResult, TVariables>(
    document: TypedDocumentNode<TResult, TVariables>,
    variables: TVariables,
  ): SseSubscription<TResult> {
    const subscription = SseSubscription.open(
      this.environment.gatewayUrl,
      document,
      variables,
    );
    this.subscriptions.push(subscription);
    return subscription;
  }

  async close(): Promise<void> {
    await Promise.all(
      this.subscriptions.map((subscription) => subscription.close()),
    );
  }
}
