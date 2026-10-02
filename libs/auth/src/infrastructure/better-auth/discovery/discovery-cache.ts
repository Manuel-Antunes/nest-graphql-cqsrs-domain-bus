/**
 * **How long a cache in front of the issuer may keep its public documents** — the authorization
 * server's discovery documents and its JWKS: five minutes fresh, then served stale for a day while
 * the cache revalidates, and for a day when the origin fails.
 *
 * Whoever validates a token fetches them first — AgentCore's JWT authorizers on every create, update
 * and cold invocation of a runtime, Apollo MCP Server in every new microVM — and they are answered by
 * functions that may be cold. Stale-while-revalidate is what keeps those fetches from waiting on a
 * cold start: CloudFront answers from its copy and refreshes it behind the request. Five minutes is
 * the longest a rotated key or a changed endpoint goes unseen.
 */
export const DISCOVERY_CACHE_CONTROL =
  'public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400';
