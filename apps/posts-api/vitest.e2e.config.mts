import { testProject } from '../../vitest.shared.mts';

/**
 * The e2e suite boots the whole application and talks to it over HTTP and WebSocket. It signs up
 * through Better Auth and keeps the session the sign-up answers with, so it does not require the
 * address to be verified first — the verification flow is `apps/web-e2e`'s, through a real inbox.
 */
export default testProject({
  name: '@nestposts/posts-api:e2e',
  include: ['test/**/*.e2e-spec.ts'],
  database: 'own',
  env: {
    POSTS_TRANSPORT: 'memory',
    AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
  },
  testTimeout: 30000,
});
