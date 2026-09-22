import 'server-only';

import { HttpLink } from '@apollo/client';
import {
  ApolloClient,
  registerApolloClient,
} from '@apollo/client-integration-nextjs';

import { WebAuth } from '@/lib/auth/server';
import { GRAPHQL_UPSTREAM } from '@/lib/env';

import './fragment-warnings';

import { createCache } from './cache';

export const { getClient, query, PreloadQuery } = registerApolloClient(
  async () => {
    const session = await WebAuth.sessionCookie();
    const tenant = await WebAuth.tenantHeader();

    return new ApolloClient({
      cache: createCache(),
      link: new HttpLink({
        uri: GRAPHQL_UPSTREAM,
        headers: { ...(session ? { cookie: session } : {}), ...tenant },
        fetchOptions: { cache: 'no-store' },
      }),
    });
  },
);
