import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { appConfig } from './config/app.config';
import { Supergraph } from './supergraph/supergraph';

const outDir = process.argv[2] ?? join(__dirname, 'supergraph');
const supergraph = new Supergraph(appConfig().subgraphs);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'supergraph.graphql'), supergraph.sdl());
writeFileSync(join(outDir, 'api.graphql'), supergraph.apiSchema());
