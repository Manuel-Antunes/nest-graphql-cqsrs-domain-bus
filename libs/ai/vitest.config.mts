import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/ai',
  include: ['src/**/*.spec.ts'],
  testTimeout: 60000,
  database: true,
});
