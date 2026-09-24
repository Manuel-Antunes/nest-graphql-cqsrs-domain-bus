import { testProject } from '../../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/observability',
  include: ['src/**/*.spec.ts'],
});
