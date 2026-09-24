export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/** This application's own origin — Better Auth runs here, so its cookies belong to it. */
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:4200';

/** The header a tenant travels under, all the way to the broker. */
export const TENANT_HEADER = 'x-tenant';

/** The federation gateway: every operation this application sends goes here. */
export const GRAPHQL_UPSTREAM =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000/graphql';

export const GRAPHQL_PROXY = '/api/graphql';

/**
 * The posts subgraph itself, addressed only by what plays the router's part on purpose — the
 * federation page, which calls `_entities` the way the gateway would.
 */
export const POSTS_SUBGRAPH =
  process.env.POSTS_SUBGRAPH_URL ?? `${API_URL}/graphql`;

export const POSTS_SUBGRAPH_PROXY = '/api/graphql/posts';

/** The context an operation carries to be sent to the posts subgraph instead of the gateway. */
export const TO_POSTS_SUBGRAPH = { subgraph: 'posts' } as const;

export function upstreamHost(): string {
  try {
    return new URL(GRAPHQL_UPSTREAM).host;
  } catch {
    return GRAPHQL_UPSTREAM;
  }
}
