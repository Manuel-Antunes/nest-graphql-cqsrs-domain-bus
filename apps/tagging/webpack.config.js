const { nestApplication } = require('../../tools/webpack/nest-application');

module.exports = nestApplication({
  projectRoot: __dirname,
  entryPoints: [{ entryName: 'lambda/sqs', entryPath: './src/lambda/sqs.ts' }],
  tenantMigrations: true,
});
