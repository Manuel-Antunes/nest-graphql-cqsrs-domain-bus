import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/tagging',
  include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  database: 'own',
  env: {
    TAGGING_TRANSPORT: 'memory',
  },
});
