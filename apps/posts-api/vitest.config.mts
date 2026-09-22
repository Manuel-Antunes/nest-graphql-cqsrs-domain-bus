import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/posts-api',
  include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  database: true,
  env: { POSTS_SCHEMA: `spec_posts_api_${Date.now().toString(36)}` },
});
