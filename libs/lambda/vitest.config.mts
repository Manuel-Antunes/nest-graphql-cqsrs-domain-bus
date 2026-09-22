import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/lambda',
  include: ['src/**/*.spec.ts'],
});
