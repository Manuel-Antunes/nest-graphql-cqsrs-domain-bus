import { testProject } from '../../vitest.shared.mts';

export default testProject({ name: '@nestposts/posts-api', include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'] });
