/**
 * Every scope this system's OAuth provider grants. A client asks for some of them on the consent
 * screen, and its access token carries what the user allowed; a caller signed in through this
 * system's own screens — a cookie — holds all of them.
 */
export const OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'read:posts',
  'write:posts',
  'read:clients',
  'write:clients',
  'write:conversations',
] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number];
