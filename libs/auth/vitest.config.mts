import { testProject } from '../../vitest.shared.mts';

export default testProject({ name: '@nestposts/auth', include: ['src/**/*.spec.ts'], database: true });
