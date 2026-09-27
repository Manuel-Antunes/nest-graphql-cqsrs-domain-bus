import { testProject } from '../../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/microservices-memory',
  include: ['src/**/*.spec.ts'],
});
