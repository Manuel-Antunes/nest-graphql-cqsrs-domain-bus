import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/tagging',
  include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  env: { TAGGING_DB: ':memory:', TAGGING_TRANSPORT: 'memory' },
});
