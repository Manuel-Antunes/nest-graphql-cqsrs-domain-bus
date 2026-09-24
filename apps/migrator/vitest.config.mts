import { mergeConfig } from 'vitest/config';

import { testProject } from '../../vitest.shared.mts';

export default mergeConfig(
  testProject({
    name: '@nestposts/migrator',
    include: ['src/**/*.spec.ts'],
    database: 'own',
    testTimeout: 60000,
  }),
  { test: { fileParallelism: false } },
);
