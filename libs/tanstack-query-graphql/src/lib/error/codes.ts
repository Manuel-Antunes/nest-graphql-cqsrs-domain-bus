/**
 * Maps backend error codes (GraphQL `extensions.code` and oRPC `ORPCError.code`)
 * to the HTTP status we route on. Both backends use the same string vocabulary
 * for the auth-relevant cases, so a single map serves both.
 */
export const GRAPHQL_CODE_TO_STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_USER_INPUT: 422,
  UNPROCESSABLE_CONTENT: 422,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

/** Statuses that map to a dedicated error page / Next.js auth interrupt. */
export type AppErrorStatus = 401 | 403 | 404 | 422 | 500;
