import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: ['../gateway/dist/supergraph/api.graphql', 'mcp-apps.graphql'],
  documents: [
    'src/**/*.{ts,tsx}',
    '!src/graphql/__gen__/**/*',
    '!src/**/*.spec.{ts,tsx}',
  ],
  ignoreNoDocuments: true,
  generates: {
    'src/graphql/__gen__/': {
      preset: 'client',
      presetConfig: {
        gqlTagName: 'gql',
        fragmentMasking: { unmaskFunctionName: 'getFragmentData' },
      },
      config: {
        scalars: {
          DateTime: 'string',
          JSON: 'Record<string, unknown>',
        },
        useTypeImports: true,
        skipTypename: false,
        enumsAsTypes: true,
      },
    },
  },
};

export default config;
