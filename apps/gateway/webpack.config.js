const { nestApplication } = require('../../tools/webpack/nest-application');
const { subgraphSources } = require('./scripts/subgraph-sources.mjs');

module.exports = nestApplication({
  projectRoot: __dirname,
  entryPoints: [
    { entryName: 'compose', entryPath: './src/compose.ts' },
    { entryName: 'lambda/http', entryPath: './src/lambda/http.ts' },
  ],
  assets: subgraphSources.map(({ name, sdlDir }) => ({
    input: sdlDir,
    glob: '*.graphql',
    output: `subgraphs/${name}`,
  })),
});
