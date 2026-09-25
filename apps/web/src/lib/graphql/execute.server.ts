import 'server-only';

import { env } from '@/env.mjs';
import { WebAuth } from '@/lib/auth/server';
import { Endpoints } from '@/lib/endpoints';

import type { GraphqlEndpoint } from './execute';
import { GRAPHQL_ACCEPT } from './execute';

const UPSTREAMS: Record<GraphqlEndpoint, string> = {
  gateway: env.NEXT_PUBLIC_GATEWAY_URL,
  posts: Endpoints.postsSubgraph(),
};

globalThis.$graphqlServerTransport = async (endpoint, request) => {
  const session = await WebAuth.sessionCookie();
  const tenant = await WebAuth.tenantHeader();

  return fetch(UPSTREAMS[endpoint], {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: GRAPHQL_ACCEPT,
      ...(session ? { cookie: session } : {}),
      ...tenant,
    },
    body: JSON.stringify(request),
    cache: 'no-store',
  });
};
