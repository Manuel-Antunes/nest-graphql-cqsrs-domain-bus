export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/** This application's own origin — Better Auth runs here, so its cookies belong to it. */
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:4200';

/** The header a tenant travels under, all the way to the broker. */
export const TENANT_HEADER = 'x-tenant';

export const GRAPHQL_UPSTREAM = `${API_URL}/graphql`;

export const GRAPHQL_PROXY = '/api/graphql';

/**
 * Subscriptions do not go through the proxy: a Next route handler answers a request, and a
 * subscription is a stream that stays open. They are `@AllowAnonymous` on the API, so the browser
 * opens this one itself — on the same `/graphql` URL, asking for `text/event-stream`.
 */

export function upstreamHost(): string {
  try {
    return new URL(GRAPHQL_UPSTREAM).host;
  } catch {
    return GRAPHQL_UPSTREAM;
  }
}
