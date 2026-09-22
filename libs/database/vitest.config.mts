import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/database',
  include: ['src/**/*.spec.ts'],
  database: true,
});
