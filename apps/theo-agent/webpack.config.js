const { nestApplication } = require('../../tools/webpack/nest-application');

module.exports = nestApplication({
  projectRoot: __dirname,
  bundledPackages: ['bedrock-agentcore'],
});
