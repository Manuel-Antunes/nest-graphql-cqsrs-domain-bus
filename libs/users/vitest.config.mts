import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/users',
  include: ['src/**/*.spec.ts'],
  database: true,
});
