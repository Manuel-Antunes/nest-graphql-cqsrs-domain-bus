import { mergeConfig } from 'vitest/config';

import { testProject } from '../../vitest.shared.mts';

export default mergeConfig(
  testProject({
    name: '@nestposts/chat-api',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    database: 'own',
    env: {
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
      AUTH_RATE_LIMIT: 'false',
    },
  }),
  { test: { fileParallelism: false } },
);
