import { testProject } from '../../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/event-store-mikro-orm',
  include: ['src/**/*.spec.ts'],
  database: true,
});
