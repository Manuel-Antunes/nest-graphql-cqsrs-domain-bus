import { ApolloLink, HttpLink } from '@apollo/client';
import { ApolloClient } from '@apollo/client-integration-nextjs';

import {
  GRAPHQL_PROXY,
  GRAPHQL_UPSTREAM,
  POSTS_SUBGRAPH,
  POSTS_SUBGRAPH_PROXY,
  TO_POSTS_SUBGRAPH,
} from '@/lib/env';

import './fragment-warnings';

import { createCache } from './cache';
import { GraphQLSSELink } from './links/sse-link';

export function makeClient(): ApolloClient {
  const onServer = typeof window === 'undefined';

  return new ApolloClient({
    link: ApolloLink.split(
      (operation) => operation.operationType === 'subscription',
      new GraphQLSSELink(GRAPHQL_UPSTREAM),
      ApolloLink.split(
        (operation) =>
          operation.getContext().subgraph === TO_POSTS_SUBGRAPH.subgraph,
        new HttpLink({
          uri: onServer ? POSTS_SUBGRAPH : POSTS_SUBGRAPH_PROXY,
        }),
        new HttpLink({ uri: onServer ? GRAPHQL_UPSTREAM : GRAPHQL_PROXY }),
      ),
    ),
    cache: createCache(),
    devtools: { enabled: process.env.NODE_ENV !== 'production' },
  });
}
