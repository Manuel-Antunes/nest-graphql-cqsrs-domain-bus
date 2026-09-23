import nestConfig from '../../eslint.nest.config.mjs';

export default [
  ...nestConfig,

  {
    ignores: ['src/migrations/**'],
  },
];
