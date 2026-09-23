import nestConfig from '../../eslint.nest.config.mjs';

export default [
  ...nestConfig,

  {
    files: ['test/**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
