import vitest from '@vitest/eslint-plugin';

import baseConfig from './eslint.base.config.mjs';

export default [
  ...baseConfig,

  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',

      '@typescript-eslint/no-empty-function': [
        'error',
        { allow: ['methods', 'asyncMethods', 'arrowFunctions'] },
      ],

      '@typescript-eslint/no-this-alias': [
        'error',
        { allowDestructuring: true, allowedNames: ['VO'] },
      ],

      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'always' },
      ],

      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },

  {
    files: ['**/*.spec.ts'],
    plugins: { vitest },
    rules: {
      'vitest/expect-expect': [
        'error',
        { assertFunctionNames: ['expect', 'expect*', 'assert*', 'rejects'] },
      ],
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
      'vitest/no-identical-title': 'error',
      'vitest/no-standalone-expect': 'error',
      'vitest/prefer-to-be': 'error',
    },
  },

  {
    ignores: ['dist/**', 'coverage/**', 'out-tsc/**', 'target/**'],
  },
];
