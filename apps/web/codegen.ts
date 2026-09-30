import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: ['../gateway/dist/supergraph/api.graphql', 'federation.graphql'],
  documents: ['src/**/*.{ts,tsx}', '!src/gql/**/*'],
  ignoreNoDocuments: true,
  generates: {
    'src/gql/': {
      preset: 'client',
      presetConfig: {
        fragmentMasking: { unmaskFunctionName: 'getFragmentData' },
      },
      config: {
        documentMode: 'string',
        scalars: {
          DateTime: 'string',
          ISO8601DateTime: 'string',
          JSON: 'Record<string, unknown>',
          Mixed: 'string | number | boolean | null',
          _Any: 'Record<string, unknown>',
        },
        useTypeImports: true,
        skipTypename: false,
        enumsAsTypes: true,
      },
    },
    'src/gql/possible-types.ts': {
      plugins: ['fragment-matcher'],
      config: { module: 'es2015', apolloClientVersion: 3 },
    },
  },
  hooks: {
    afterAllFileWrite: [],
  },
};

export default config;
