import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../posts-api/src/graphql/**/*.graphql',
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
        },
        useTypeImports: true,
        skipTypename: false,
        enumsAsTypes: true,
      },
    },
  },
};

export default config;
