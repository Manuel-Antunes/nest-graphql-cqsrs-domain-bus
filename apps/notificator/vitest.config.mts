import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/notificator',
  include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  database: true,
  env: {
    POSTS_SCHEMA: `spec_notificator_${Date.now().toString(36)}`,
    NOTIFICATOR_TRANSPORT: 'memory',
    MAIL_TRANSPORT: 'json',
  },
});
