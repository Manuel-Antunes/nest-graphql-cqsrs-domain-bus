import { testProject } from '../../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/outbox-mikro-orm',
  include: ['src/**/*.spec.ts'],
  database: true,
});
