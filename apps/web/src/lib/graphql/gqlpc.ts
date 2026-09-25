import { GqlRpc, useSubscription } from '@nestposts/tanstack-query-graphql';

import { getGraphCache } from '@/lib/query-client';

import { executorFor } from './execute';
import { subscribe } from './subscribe';

export const EVERY_GRAPH_QUERY = ['graph'] as const;

const gateway = new GqlRpc(executorFor('gateway'), getGraphCache(), subscribe);
type Gateway = typeof gateway;

export const gqlQueryOptions: Gateway['gqlQueryOptions'] =
  gateway.gqlQueryOptions.bind(gateway);

export const gqlInfiniteOptions: Gateway['gqlInfiniteOptions'] =
  gateway.gqlInfiniteOptions.bind(gateway);

export const gqlMutationOptions: Gateway['gqlMutationOptions'] =
  gateway.gqlMutationOptions.bind(gateway);

export const gqlSubscriptionOptions: Gateway['gqlSubscriptionOptions'] =
  gateway.gqlSubscriptionOptions.bind(gateway);

const postsSubgraph = new GqlRpc(executorFor('posts'), getGraphCache());

export const postsSubgraphQueryOptions: (typeof postsSubgraph)['gqlQueryOptions'] =
  postsSubgraph.gqlQueryOptions.bind(postsSubgraph);

export { useSubscription };
