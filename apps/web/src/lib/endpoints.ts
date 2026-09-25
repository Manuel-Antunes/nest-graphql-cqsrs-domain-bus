import { env } from '@/env.mjs';

export class Endpoints {
  static readonly tenantHeader = 'x-tenant';

  static readonly graphqlProxy = '/api/graphql';

  static readonly postsSubgraphProxy = '/api/graphql/posts';

  static postsSubgraph(): string {
    return env.POSTS_SUBGRAPH_URL ?? `${env.NEXT_PUBLIC_API_URL}/graphql`;
  }

  static upstreamHost(): string {
    try {
      return new URL(env.NEXT_PUBLIC_GATEWAY_URL).host;
    } catch {
      return env.NEXT_PUBLIC_GATEWAY_URL;
    }
  }
}
