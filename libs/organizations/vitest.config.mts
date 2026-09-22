import { testProject } from '../../vitest.shared.mts';

export default testProject({ name: '@nestposts/organizations', include: ['src/**/*.spec.ts'], database: true });
