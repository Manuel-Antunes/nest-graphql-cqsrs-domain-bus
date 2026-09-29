import { testProject } from '../../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/redis',
  include: ['src/**/*.spec.ts'],
});
