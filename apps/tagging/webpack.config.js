const { nestApplication } = require('../../tools/webpack/nest-application');

module.exports = nestApplication({
  projectRoot: __dirname,
  entryPoints: [
    { entryName: 'lambda/sqs', entryPath: './src/lambda/sqs.ts' },
    { entryName: 'lambda/relay', entryPath: './src/lambda/relay.ts' },
  ],
  tenantMigrations: true,
});
