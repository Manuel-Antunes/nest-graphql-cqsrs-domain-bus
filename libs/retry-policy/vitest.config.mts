import { testProject } from '../../vitest.shared.mts';

export default testProject({
  name: '@nestposts/retry-policy',
  include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
});
