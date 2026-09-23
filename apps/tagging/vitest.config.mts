import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/tagging',
  include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  database: true,
  env: {
    TAGGING_SCHEMA: `spec_tagging_${Date.now().toString(36)}`,
    TAGGING_TRANSPORT: 'memory',
  },
});
