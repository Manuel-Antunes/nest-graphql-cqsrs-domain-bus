import { mergeConfig } from 'vitest/config';

import { testProject } from '../../vitest.shared.mts';

export default mergeConfig(
  testProject({
    name: '@nestposts/notificator',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    database: 'own',
    env: {
      NOTIFICATOR_TRANSPORT: 'memory',
      MAIL_TRANSPORT: 'json',
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
      AUTH_RATE_LIMIT: 'false',
    },
  }),
  { test: { fileParallelism: false } },
);
