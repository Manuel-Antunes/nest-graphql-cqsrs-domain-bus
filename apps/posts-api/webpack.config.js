const { nestApplication } = require('../../tools/webpack/nest-application');

module.exports = nestApplication({
  projectRoot: __dirname,
  entryPoints: [
    { entryName: 'lambda/http', entryPath: './src/lambda/http.ts' },
    { entryName: 'lambda/sqs', entryPath: './src/lambda/sqs.ts' },
  ],
  assets: [{ input: './src/graphql', glob: '**/*.graphql', output: 'graphql' }],
  tenantMigrations: true,
});
