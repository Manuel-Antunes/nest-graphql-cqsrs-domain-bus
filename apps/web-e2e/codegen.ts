import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../gateway/dist/supergraph/api.graphql',
  documents: ['src/**/*.ts', '!src/gql/**/*'],
  ignoreNoDocuments: true,
  generates: {
    'src/gql/': {
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        scalars: {
          DateTime: 'string',
          ISO8601DateTime: 'string',
          JSON: 'Record<string, unknown>',
          Mixed: 'string | number | boolean | null',
        },
        useTypeImports: true,
        skipTypename: false,
        enumsAsTypes: true,
      },
    },
  },
};

export default config;
