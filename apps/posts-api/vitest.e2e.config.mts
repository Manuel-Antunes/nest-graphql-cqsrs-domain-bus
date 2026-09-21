import { testProject } from '../../vitest.shared.mts';

/** The e2e suite boots the whole application and talks to it over HTTP and WebSocket. */
export default testProject({
  name: '@nestposts/posts-api:e2e',
  include: ['test/**/*.e2e-spec.ts'],
  env: {
    POSTS_DB: ':memory:',
    POSTS_TRANSPORT: 'memory',
    POSTS_TAGGING_IN_PROCESS: 'true',
  },
  testTimeout: 30000,
});
