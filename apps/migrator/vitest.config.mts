import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/migrator',
  include: ['src/**/*.spec.ts'],
  database: true,
  testTimeout: 60000,
  env: { POSTS_SCHEMA: `spec_migrator_${Date.now().toString(36)}` },
});
