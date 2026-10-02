import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/chat',
  include: ['src/**/*.spec.ts'],
});
