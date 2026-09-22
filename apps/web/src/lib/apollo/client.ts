import { ApolloLink, HttpLink } from '@apollo/client';
import { ApolloClient } from '@apollo/client-integration-nextjs';

import { GRAPHQL_PROXY, GRAPHQL_SOCKET, GRAPHQL_UPSTREAM } from '@/lib/env';

import './fragment-warnings';

import { createCache } from './cache';
import { GraphQLSocketLink } from './links/socket-link';

export function makeClient(): ApolloClient {
  const uri = typeof window === 'undefined' ? GRAPHQL_UPSTREAM : GRAPHQL_PROXY;

  return new ApolloClient({
    link: ApolloLink.split(
      (operation) => operation.operationType === 'subscription',
      new GraphQLSocketLink(GRAPHQL_SOCKET),
      new HttpLink({ uri }),
    ),
    cache: createCache(),
    devtools: { enabled: process.env.NODE_ENV !== 'production' },
  });
}
