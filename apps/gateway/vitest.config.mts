import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/gateway',
  include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
});
