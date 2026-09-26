import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/events',
  include: ['src/**/*.spec.ts'],
  database: 'own',
});
