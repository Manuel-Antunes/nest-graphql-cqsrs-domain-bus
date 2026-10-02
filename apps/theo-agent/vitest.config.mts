import { mergeConfig } from 'vitest/config';

import { testProject } from '../../vitest.shared.mts';

export default mergeConfig(
  testProject({
    name: '@nestposts/theo-agent',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    database: 'own',
    env: { AUTH_RATE_LIMIT: 'false' },
  }),
  { test: { fileParallelism: false } },
);
